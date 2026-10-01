import {
  DOCUMENT_NO_LABEL,
  DOCUMENT_TITLE,
  INVOICE_COPIES,
  ITEM_UNIT,
  TAXABLE_DOCUMENT_TYPES,
  TAX_DISPLAYING_DOCUMENT_TYPES,
} from '@/lib/constants'
import { formatDate, formatMoney, joinAddress, validTill } from '@/lib/format'
import type { CompanySettingsRow, InvoiceLineRow, InvoiceRow } from '@/types/database'

type Props = {
  invoice: InvoiceRow
  lines: InvoiceLineRow[]
  /** Live settings, used only for an unissued draft. */
  settings: CompanySettingsRow | null
  /**
   * The live client record, used only for an unissued draft — exactly as
   * `settings` is for the supplier side. An issued document reads its buyer
   * from `buyer_snapshot` and nothing else, so a client who moves or changes
   * their GSTIN can never rewrite a document that has already gone out.
   */
  buyerFallback: BuyerFallback | null
  copies: (keyof typeof INVOICE_COPIES)[]
}

type BuyerFallback = {
  name: string | null
  address: string | null
  city: string | null
  state: string | null
  gstin: string | null
  contact_name: string | null
  contact_phone: string | null
}

type Slab = { rate: number; taxable: number; cgst: number; sgst: number; igst: number }

/**
 * One tax row per rate, in rate order.
 *
 * The supplied format shows a single "CGST @ 9%" / "SGST @ 9%" pair because
 * every line on that sample sat at 18%. Since GST became per line, a document
 * can carry several rates at once, and a single pair would be arithmetically
 * meaningless. Grouping keeps the single-rate case reading exactly like the
 * sample and lets the mixed case expand to one row per slab.
 *
 * The figures are summed from the lines, which Postgres already rounded
 * individually — never recomputed from a rate against the document total.
 */
function slabsOf(lines: InvoiceLineRow[]): Slab[] {
  const map = new Map<number, Slab>()
  for (const line of lines) {
    const rate = Number(line.gst_rate ?? 0)
    const slab = map.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    slab.taxable += Number(line.taxable_value ?? 0)
    slab.cgst += Number(line.cgst_amount ?? 0)
    slab.sgst += Number(line.sgst_amount ?? 0)
    slab.igst += Number(line.igst_amount ?? 0)
    map.set(rate, slab)
  }
  return [...map.values()].sort((a, b) => a.rate - b.rate)
}

/**
 * "8,000" — a bare figure to sit inside "@ Rs. …/-".
 *
 * Not formatMoney(): that would print "₹8,000.00" into a sentence that already
 * says Rs., and a rate agreed as a round number should not gain two zeros on
 * the way to the page. Grouped in the Indian style, because a six-figure visit
 * rate printed as 150000 is a rate someone will misread.
 */
function plainAmount(value: number | string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/**
 * The site installation sentence, composed rather than stored.
 *
 * This was one fixed line in this file — "Site Installation & visit charges @
 * Rs. 8000/- as extra. Total of 2 visits." — which meant a different rate
 * needed a code change, and every customer got the same number of visits
 * whatever had been agreed. The scope now comes from a list the owner controls
 * and the two figures from the document.
 *
 * Each part is optional and drops out cleanly. A document with no scope and no
 * rate prints no line at all, which is the right answer for the supplies that
 * involve no site work.
 */
function installationSentence(
  scope: string | null,
  rate: number | string | null,
  visits: number | null
): string | null {
  const parts: string[] = []
  const hasRate = rate !== null && rate !== undefined && Number(rate) > 0

  if (scope) {
    parts.push(hasRate ? `${scope} @ Rs. ${plainAmount(rate)}/- as extra.` : `${scope}.`)
  } else if (hasRate) {
    // A rate with nothing to attach it to still has to say what it is for.
    parts.push(`Visit charges @ Rs. ${plainAmount(rate)}/- as extra.`)
  }

  if (parts.length > 0 && visits !== null && visits !== undefined) {
    parts.push(`Total of ${visits} ${visits === 1 ? 'visit' : 'visits'}.`)
  }

  return parts.length > 0 ? parts.join(' ') : null
}

const money = (v: number | string | null | undefined) => formatMoney(v, 'INR', true)

/**
 * The printed document — quotation, invoice and delivery challan from one
 * layout, in the format ANK already sends out.
 *
 * For an issued document every supplier and buyer detail comes from the
 * snapshot frozen at issue, never from the live records — that is the whole
 * point of snapshotting. A draft has no snapshot yet, so it falls back to live
 * settings and is watermarked DRAFT so it cannot be mistaken for the real thing.
 *
 * Three things vary by type and nothing else does:
 *   * a challan prints no tax at all — no slab rows, no tax-in-words, no GST
 *     summary, because it moves goods rather than charging for them;
 *   * a quotation prints tax but is not a tax document, so it carries no
 *     copy marking, no reverse-charge line and no place of supply;
 *   * an invoice keeps every statutory field.
 *
 * Nothing on the page is hardcoded. Terms, bank details, MSME number,
 * jurisdiction and the signatory all come from company settings, so the owner
 * changes them without a deployment.
 *
 * Printing goes through the browser's own dialogue rather than a PDF library.
 * The layout is then identical on screen and on paper, "Save as PDF" is free on
 * every platform, and the copy labels are real page breaks rather than an image.
 */
export function PrintableDocument({ invoice, lines, settings, buyerFallback, copies }: Props) {
  const supplier = invoice.supplier_snapshot ?? settings
  // The snapshot always wins where it exists; the fallback only ever fills a
  // draft, which has no snapshot yet.
  const buyer = invoice.buyer_snapshot ?? buyerFallback
  const isStatutoryTax = TAXABLE_DOCUMENT_TYPES.includes(invoice.doc_type)
  const showsTax = TAX_DISPLAYING_DOCUMENT_TYPES.includes(invoice.doc_type)
  const isDraft = invoice.status === 'draft'

  // The logo is printed behind every document, at the owner's request — a real
  // invoice carries it as branding and it makes a sheet harder to pass off.
  //
  // What separates a valid document from one that is not is the WORD over the
  // top, not the logo: only a draft or a cancelled document gets one, and it
  // stays legible over the mark. A sheet carrying nothing but a faint logo is
  // therefore the real thing, which is exactly what it now looks like.
  // The two statuses are mutually exclusive, so at most one word ever applies.
  const stamp = isDraft
    ? { word: 'Draft', size: 80, ink: '0.06' }
    : invoice.status === 'cancelled'
      ? { word: 'Cancelled', size: 70, ink: '0.08' }
      : null
  const markInk = stamp ? stamp.ink : '0.06'

  /*
   * Terms come from the document first and the supplier only as a fallback.
   *
   * They used to come from company settings alone, which made them identical
   * on every document the firm had ever sent. They are now columns on the
   * invoice, seeded from Settings when the draft is raised and editable until
   * it is issued.
   *
   * The fallback is not defensive padding — it is what keeps documents raised
   * before those columns existed printing the words they have always printed.
   * Those sentences were frozen into supplier_snapshot at issue, so reading
   * through to it reproduces the original sheet exactly. `supplier` is already
   * the snapshot for an issued document and live settings for a draft, so this
   * one expression covers both.
   */
  const paymentTerms = invoice.payment_terms ?? supplier?.payment_terms ?? null
  /*
   * The closing terms.
   *
   * They were printed straight from invoice.terms, which is only ever filled
   * at issue. So a draft showed nothing here and the sentence appeared out of
   * nowhere on the issued sheet, and because the column is frozen, emptying
   * or rewording "Terms and conditions" in Settings afterwards changed
   * neither. A draft now reads through to live settings, so the preview shows
   * what will actually print: clear the setting and the line goes, reword it
   * and the new words appear, exactly as typed.
   *
   * The fallback is deliberately limited to a draft rather than reaching
   * through `supplier` the way payment terms and delivery do. Ten quotations
   * already issued carry terms = null beside a supplier_snapshot that still
   * holds an invoice_terms sentence, and a snapshot-wide fallback would start
   * printing a line on documents that have already gone to customers. An
   * issued document prints its own frozen column and nothing else.
   *
   * A quotation takes quotation_terms and every other type invoice_terms,
   * which is the split issue_document applies when it freezes the value.
   */
  const closingTerms =
    invoice.terms ??
    (isDraft
      ? (invoice.doc_type === 'quotation' ? settings?.quotation_terms : settings?.invoice_terms)
      : null) ??
    null
  const deliveryTimeline = invoice.delivery_timeline ?? supplier?.delivery_timeline ?? null
  const installationLine = installationSentence(
    invoice.installation_scope,
    invoice.visit_rate,
    invoice.visit_count
  )

  // Intrastate splits into CGST + SGST, interstate into IGST. Decided by what
  // Postgres actually put on the lines, not re-derived from the state codes.
  const intrastate = Number(invoice.cgst_amount) > 0 || Number(invoice.sgst_amount) > 0
  const slabs = showsTax ? slabsOf(lines).filter((s) => s.rate > 0) : []
  const singleSlab = slabs.length === 1

  // A copy marking is a tax-invoice rule. A quotation printed three times as
  // "Original for Recipient / Duplicate for Transporter" would be nonsense.
  const sheets = isStatutoryTax ? copies : (['original'] as const)

  return (
    <div className="print-root space-y-6">
      {sheets.map((copy, index) => (
        // These classes are the on-screen preview only: a page-shaped white
        // card so the layout reads as paper before it is printed. The printed
        // box — width, padding, height, border — belongs entirely to the
        // `.doc-copy` rule in globals.css, whose declarations carry !important
        // and override anything set here. Adding `print:` utilities to this
        // line does nothing; that is how the page margin went missing while
        // looking as though it were set.
        // Two things on this line are load-bearing and easy to undo by accident.
        //
        // `leading-[15px]` is an integer on purpose. It was `leading-snug`,
        // which on 11px text is 15.125px, so every line of the document added
        // an eighth of a pixel of drift and each horizontal rule ended up at a
        // different sub-pixel offset (.16, .31, .44, .66, .78, .84 — measured,
        // not guessed). A 1px rule at y.5 is painted across two device rows at
        // half coverage and reads as a soft thick band; the same rule at y.0
        // lands on one row and reads as a crisp thin one. At 100% display
        // scaling everything rounds the same way, which is why the owner saw
        // it on two machines and nobody else saw it at all. A whole-pixel line
        // box puts every rule on a whole pixel so they all round together.
        // 15px rather than 16px because the sheet already uses 272 of its
        // 273mm, and a taller line box would push documents onto a second page.
        //
        // The rules are opaque greys rather than black/30 and black/40 for the
        // same reason: a translucent line spread over two rows is faint and
        // fuzzy where the same line on one row is sharp, which is what made the
        // difference so obvious. #b3b3b3 is rgba(0,0,0,.3) over white and
        // #a6a6a6 is the .4, so the design is unchanged.
        <article
          key={copy}
          className="doc-copy relative mx-auto flex min-h-[273mm] w-full max-w-[190mm] flex-col border bg-white p-6 text-[11px] leading-[15px] text-black"
          style={index < sheets.length - 1 ? { pageBreakAfter: 'always' } : undefined}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            {/* An <img> rather than a CSS background: print stylesheets drop
                background images routinely, which would leave the watermark
                looking right on screen and missing on paper. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/print-logo.svg"
              alt=""
              width={480}
              height={317}
              className="doc-ink absolute"
              style={{ opacity: Number(markInk) }}
            />
            {stamp && (
              <p
                className="relative font-bold uppercase tracking-widest"
                style={{
                  fontSize: `${stamp.size}px`,
                  color: `rgb(0 0 0 / ${stamp.ink})`,
                }}
              >
                {stamp.word}
              </p>
            )}
          </div>

          {/* The supplied sheet has no supplier block — it was printed on
              letterhead. A browser print has no letterhead, and a tax invoice
              without the supplier's name and GSTIN is not a valid one, so the
              identity is printed unless Settings says the stationery already
              carries it. Compared against false, not merely truthy: a document
              issued before the setting existed has no such key in its snapshot,
              and that must keep printing the header rather than lose it. */}
          {supplier?.print_supplier_header !== false && (
          <header className="flex items-center gap-3 border-b border-[#b3b3b3] pb-2">
            {/* Sized to the identity block beside it so the header keeps the
                height it had before the logo was added — a taller header is
                what would push a long document onto a second sheet. The width
                and height are explicit so print does not reflow while the
                image is still being fetched.
                The SVG is used rather than the PNG: it came from a vector
                original and stays sharp at any print resolution. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/print-logo.svg"
              alt=""
              width={64}
              height={42}
              className="doc-ink shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-sm font-bold uppercase">
                {supplier?.legal_name ?? 'Company name not set'}
              </h1>
              <p>{joinAddress(supplier?.address_line1, supplier?.address_line2)}</p>
              <p>
                {joinAddress(supplier?.city, supplier?.state_name, supplier?.pincode)}
                {supplier?.phone ? ` · ${supplier.phone}` : ''}
                {supplier?.email ? ` · ${supplier.email}` : ''}
              </p>
              {supplier?.gstin && (
                <p className="font-medium">
                  GSTIN: {supplier.gstin}
                  {supplier.pan ? ` · PAN: ${supplier.pan}` : ''}
                </p>
              )}
            </div>
          </header>
          )}

          <h2 className="border-b border-[#b3b3b3] py-1.5 text-center text-sm font-bold">
            {DOCUMENT_TITLE[invoice.doc_type]}
            {isStatutoryTax && (
              <span className="ml-2 text-[11px] font-normal uppercase tracking-wide">
                ({INVOICE_COPIES[copy]})
              </span>
            )}
          </h2>

          <section className="grid grid-cols-[1.6fr_1fr] border-b border-[#b3b3b3]">
            <div className="border-r border-[#b3b3b3] p-2">
              <p>
                <span>
                  {invoice.doc_type === 'quotation' ? 'Quote To:' : 'Bill To:'}
                </span>{' '}
                <span className="font-semibold">{buyer?.name ?? '—'}</span>
              </p>
              {buyer?.contact_name && (
                <p>
                  <span>Customer&rsquo;s Name:</span>{' '}
                  {buyer.contact_name}
                  {buyer.contact_phone ? ` (${buyer.contact_phone})` : ''}
                </p>
              )}
              <p>
                <span>Address:</span>{' '}
                {joinAddress(buyer?.address, buyer?.city) || '—'}
              </p>
              <p>
                <span>GSTIN/UIN :</span> {buyer?.gstin || '-'}
              </p>
              <p>
                <span>State/U.T :</span> {buyer?.state || '-'}
              </p>
            </div>

            <div className="p-2">
              <p>
                <span>Date:</span> {formatDate(invoice.doc_date)}
              </p>
              {/* The date payment falls due, directly under the document
                  date where a customer looks for it.
                  
                  Quotations only, at the owner's instruction. It was printing
                  on every type that was not a challan, which put a due date on
                  a tax invoice that already states its own terms at the foot,
                  and on credit notes, where it means nothing at all. The
                  quotation is the document that carries it, because that is
                  where the terms are being offered rather than restated.
                  
                  The maker types a number of days; the date is derived, so
                  nobody counts forward from the document date by hand and the
                  two can never disagree. See validTill(). */}
              {invoice.doc_type === 'quotation' && (
                <p>
                  <span>Payment due date:</span>{' '}
                  <span className="font-medium">
                    {invoice.valid_days === 0
                      ? formatDate(invoice.doc_date)
                      : validTill(invoice.doc_date, invoice.valid_days)}
                  </span>
                </p>
              )}
              <p>
                <span>{DOCUMENT_NO_LABEL[invoice.doc_type]}:</span>{' '}
                <span className="font-semibold">{invoice.doc_no ?? 'Not yet issued'}</span>
              </p>
              {isStatutoryTax && invoice.place_of_supply_code && (
                <p>
                  <span>Place of supply:</span>{' '}
                  {invoice.place_of_supply_code} — {invoice.place_of_supply_name}
                </p>
              )}
              {isStatutoryTax && (
                <p>
                  <span>Reverse charge:</span>{' '}
                  {invoice.reverse_charge ? 'Yes' : 'No'}
                </p>
              )}
            </div>
          </section>

          <table className="w-full border-collapse text-[13px]">
            <thead>
              {/* Headings at the same weight as every other label on the page
                  — GSTIN/UIN, Amount in words, Payment Terms. At full black
                  they read louder than the line items underneath, which are
                  the part anyone is actually looking at. 75% is the floor:
                  these get photocopied. */}
              <tr className="border-b border-[#b3b3b3] text-left align-bottom">
                <th className="w-10 px-1 py-1 font-semibold">SR. NO</th>
                <th className="px-1 py-1 font-semibold">PRODUCT / SERVICE DESCRIPTION</th>
                <th className="w-16 px-1 py-1 font-semibold">HSN/SAC</th>
                <th className="w-12 px-1 py-1 text-right font-semibold">QTY.</th>
                <th className="w-20 px-1 py-1 text-right font-semibold">RATE</th>
                <th className="w-14 px-1 py-1 font-semibold">PER</th>
                {showsTax && <th className="w-12 px-1 py-1 text-right font-semibold">GST</th>}
                <th className="w-24 px-1 py-1 text-right font-semibold">AMOUNT (₹)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id} className="align-top">
                  {/*
                   * The position in the list, not `line_no`.
                   *
                   * `line_no` is allocated as max+1 and never reused, so
                   * removing a line from a draft leaves its number behind as a
                   * hole — a six-line quotation printed 1, 3, 4, 5, 6, 7. It is
                   * a label for the reader, not an identity: nothing refers to
                   * a line by number from outside the document, and the lines
                   * arrive here already ordered by `line_no`. Numbering by
                   * position makes a gap impossible to print.
                   */}
                  <td className="px-1 py-0.5">{index + 1}</td>
                  <td className="px-1 py-0.5">
                    {line.description}
                    {Number(line.gst_rate ?? 0) === 0 && line.zero_rate_reason && (
                      <span className="block text-[11px]">
                        {line.zero_rate_reason}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-0.5">{line.hsn_sac ?? '—'}</td>
                  <td className="px-1 py-0.5 text-right">{line.quantity}</td>
                  <td className="px-1 py-0.5 text-right">{money(line.rate)}</td>
                  <td className="px-1 py-0.5">{ITEM_UNIT[line.unit]}</td>
                  {showsTax && (
                    <td className="px-1 py-0.5 text-right">{Number(line.gst_rate ?? 0)}%</td>
                  )}
                  <td className="px-1 py-0.5 text-right">{money(line.taxable_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section>
            <div className="flex justify-end border-t border-[#b3b3b3] pt-1 print:break-inside-avoid">
              <dl className="w-72 space-y-0.5">
                <div className="flex justify-between">
                  <dt>GROSS TOTAL</dt>
                  <dd>{money(invoice.taxable_value)}</dd>
                </div>

                {/* A challan reaches none of this: no slab rows, no tax total. */}
                {showsTax &&
                  slabs.map((slab) =>
                    intrastate ? (
                      <div key={slab.rate}>
                        <div className="flex justify-between">
                          <dt>
                            CGST @ {slab.rate / 2}%
                            {!singleSlab && (
                              <span> on {money(slab.taxable)}</span>
                            )}
                          </dt>
                          <dd>{money(slab.cgst)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>
                            SGST @ {slab.rate / 2}%
                            {!singleSlab && (
                              <span> on {money(slab.taxable)}</span>
                            )}
                          </dt>
                          <dd>{money(slab.sgst)}</dd>
                        </div>
                      </div>
                    ) : (
                      <div key={slab.rate} className="flex justify-between">
                        <dt>
                          IGST @ {slab.rate}%
                          {!singleSlab && (
                            <span> on {money(slab.taxable)}</span>
                          )}
                        </dt>
                        <dd>{money(slab.igst)}</dd>
                      </div>
                    )
                  )}

                <div className="flex justify-between">
                  <dt>Roundoff</dt>
                  <dd>{money(invoice.round_off)}</dd>
                </div>
                <div className="flex justify-between border-t border-[#a6a6a6] pt-0.5 text-xs font-bold">
                  <dt>TOTAL</dt>
                  <dd>{money(invoice.grand_total)}</dd>
                </div>
              </dl>
            </div>

            <div className="border-t border-[#b3b3b3] pt-1 print:break-inside-avoid">
              <p>
                <span>Amount in words :</span>{' '}
                <span className="font-medium">{invoice.amount_in_words ?? '—'}</span>
              </p>
              {/* Both words lines are computed from the stored totals in
                  Postgres. Never typed, and never left behind from a document
                  the layout was copied from. */}
              {showsTax && invoice.tax_amount_in_words && (
                <p>
                  <span>Tax Amount (in words) :</span>{' '}
                  <span className="font-medium">{invoice.tax_amount_in_words}</span>
                </p>
              )}
              <p className="mt-1">E. &amp; O.E</p>
            </div>
          </section>

          {/*
           * Payment terms through the jurisdiction line are one block that
           * breaks as a unit or not at all.
           *
           * They used to be two sections whose children each avoided breaking
           * on their own, which binds nothing together: Chromium was free to
           * break between them and strand the signature grid, or the
           * jurisdiction line, alone at the top of a second sheet. Whole
           * group or nothing — so an overflowing document carries the entire
           * foot of the page over rather than spending a sheet on one line.
           *
           * The group is around 60-70mm, well inside the 273mm page box.
           * `break-inside: avoid` is silently ignored on a block taller than
           * the page, so if this ever grows past roughly 200mm the rule stops
           * working with no warning.
           *
           * No mt-auto: it pushed this to the foot of a 273mm box and opened
           * a band of white after Delivery Timeline on any document shorter
           * than a full page. The owner asked for that gap closed, so the
           * block now follows the terms directly and the white falls below
           * the signature instead.
           */}
          <section className="print:break-inside-avoid">
            <div className="border-t border-[#b3b3b3] pt-1">
              {paymentTerms && (
                <p>
                  <span>Payment Terms :</span> {paymentTerms}
                </p>
              )}
              {deliveryTimeline && (
                <p>
                  <span>Delivery Timeline:</span> {deliveryTimeline}
                </p>
              )}
              {installationLine && <p>{installationLine}</p>}
              {invoice.notes && <p className="whitespace-pre-line">{invoice.notes}</p>}
              {closingTerms && <p className="whitespace-pre-line">{closingTerms}</p>}
            </div>

            {supplier?.bank_name && (
              <div className="border-t border-[#b3b3b3] pt-1">
                <p className="font-semibold">Company&rsquo;s Bank Details:</p>
                <p>Bank Name : {supplier.bank_name}</p>
                <p>A/c Name : {supplier.legal_name ?? '—'}</p>
                <p>A/c No. : {supplier.bank_account_no ?? '—'}</p>
                <p>Branch &amp; IFSC : {supplier.bank_branch ?? '—'} {supplier.bank_ifsc ?? ''}</p>
              </div>
            )}

            <div className="grid grid-cols-[1.6fr_1fr] border-t border-[#b3b3b3]">
              <div className="border-r border-[#b3b3b3] p-2">
                <p className="font-semibold">Declaration</p>
                {supplier?.msme_no && <p>MSME : {supplier.msme_no}</p>}
                <p>
                  We declare that this {DOCUMENT_TITLE[invoice.doc_type].toLowerCase()} shows the
                  actual price of the goods described and that all particulars are true and correct.
                </p>
              </div>
              <div className="p-2 text-center">
                <p>For {supplier?.legal_name ?? ''}</p>
                {/* The partner's signature, where the gap used to be.
                    
                    It sits between the firm's name and the designation, which
                    is exactly where a hand would put it, and it is sized to
                    the 48px of white that was already reserved there — so the
                    block is no taller than before and no document gains a page
                    from it.
                    
                    An <img> rather than a CSS background, for the same reason
                    as the watermark: print stylesheets drop background images,
                    which would leave it looking right on screen and missing on
                    paper. The file is a transparent PNG, so it lands on the
                    sheet as ink rather than as a white rectangle over the
                    rule beneath it.

                    Served by src/app/assets/signature/route.ts to signed-in
                    users who may open documents — never from /public, where
                    anyone could download it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/signature"
                  alt=""
                  width={98}
                  height={48}
                  className="doc-ink mx-auto mt-1 h-12 w-auto object-contain"
                />
                {/* The firm signs by office rather than by name, so only the
                    designation prints. signatory_name is still held in company
                    settings and in every issued document's supplier snapshot —
                    it is simply not put on the page. */}
                <p className="text-[11px]">
                  {supplier?.signatory_designation ?? 'Authorised Signatory'}
                </p>
              </div>
            </div>

            <p className="border-t border-[#b3b3b3] pt-1 text-center font-semibold uppercase">
              Subject to {supplier?.jurisdiction_city ?? 'Vadodara'} jurisdiction
            </p>

            {/* The last line on the sheet, on every type of document.
                
                It is what tells a reader that the absence of a wet ink
                signature is deliberate rather than an oversight — which
                matters more now that the sheet carries a reproduced signature
                above it.
                
                The owner wrote it as "quote/invoice", which is right for the
                two types he sends most and wrong on a delivery challan, which
                is neither. The noun comes from DOCUMENT_TITLE instead — the
                same word already printed as the heading and in the Declaration
                two lines up, so a sheet cannot end up calling itself three
                different things. */}
            <p className="pt-1 text-center text-[10px]">
              This is a computer generated {DOCUMENT_TITLE[invoice.doc_type].toLowerCase()}.
            </p>
          </section>
        </article>
      ))}
    </div>
  )
}

