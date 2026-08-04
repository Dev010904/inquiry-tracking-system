import { DOCUMENT_TYPE, INVOICE_COPIES, TAXABLE_DOCUMENT_TYPES } from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/format'
import type { CompanySettingsRow, InvoiceLineRow, InvoiceRow } from '@/types/database'

type Props = {
  invoice: InvoiceRow
  lines: InvoiceLineRow[]
  /** Live settings, used only for an unissued draft. */
  settings: CompanySettingsRow | null
  copies: (keyof typeof INVOICE_COPIES)[]
}

/**
 * The printed document.
 *
 * For an issued document every supplier and buyer detail comes from the
 * snapshot frozen at issue, never from the live records — that is the whole
 * point of snapshotting. A draft has no snapshot yet, so it falls back to
 * live settings and is watermarked DRAFT so it cannot be mistaken for the
 * real thing.
 *
 * Printing is done through the browser's own print dialogue rather than a
 * PDF library. That keeps the layout identical on screen and on paper, gets
 * "Save as PDF" for free on every platform, and means the copy labels are
 * real page breaks rather than an image.
 */
export function PrintableDocument({ invoice, lines, settings, copies }: Props) {
  const supplier = invoice.supplier_snapshot ?? settings
  const buyer = invoice.buyer_snapshot
  const isTax = TAXABLE_DOCUMENT_TYPES.includes(invoice.doc_type)
  const intrastate = invoice.cgst_amount > 0 || invoice.sgst_amount > 0
  const isDraft = invoice.status === 'draft'

  return (
    <div className="print-root space-y-6">
      {copies.map((copy, index) => (
        <article
          key={copy}
          className="doc-copy relative border bg-white p-6 text-[11px] leading-snug text-black"
          style={index < copies.length - 1 ? { pageBreakAfter: 'always' } : undefined}
        >
          {isDraft && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[80px] font-bold uppercase tracking-widest text-black/[0.06]">
              Draft
            </p>
          )}
          {invoice.status === 'cancelled' && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[70px] font-bold uppercase tracking-widest text-black/[0.08]">
              Cancelled
            </p>
          )}

          <header className="flex items-start justify-between gap-4 border-b border-black/20 pb-3">
            <div>
              <h1 className="text-base font-bold uppercase">
                {supplier?.legal_name ?? 'Company name not set'}
              </h1>
              {supplier?.trade_name && <p>{supplier.trade_name}</p>}
              <p className="mt-1 whitespace-pre-line">
                {[supplier?.address_line1, supplier?.address_line2].filter(Boolean).join('\n')}
              </p>
              <p>
                {[supplier?.city, supplier?.state_name, supplier?.pincode]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {supplier?.gstin && <p className="mt-1 font-medium">GSTIN: {supplier.gstin}</p>}
              {supplier?.pan && <p>PAN: {supplier.pan}</p>}
              <p>
                {[supplier?.phone, supplier?.email].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-sm font-bold uppercase">{DOCUMENT_TYPE[invoice.doc_type]}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide">{INVOICE_COPIES[copy]}</p>
              <p className="mt-2">
                <span className="text-black/60">No:</span>{' '}
                <span className="font-semibold">{invoice.doc_no ?? 'Not yet issued'}</span>
              </p>
              <p>
                <span className="text-black/60">Date:</span> {formatDate(invoice.doc_date)}
              </p>
              {invoice.reverse_charge && <p className="mt-1">Reverse charge: Yes</p>}
            </div>
          </header>

          {!isTax && (
            <p className="mt-2 font-semibold">
              {invoice.doc_type === 'proforma' &&
                'Proforma Invoice — not a tax invoice. This document does not create a GST liability.'}
              {invoice.doc_type === 'bill_of_supply' &&
                'Not a tax invoice — no GST charged on this supply.'}
              {invoice.doc_type === 'delivery_challan' &&
                'Delivery Challan — for movement of goods. Not a tax invoice.'}
            </p>
          )}

          <section className="mt-3 grid grid-cols-2 gap-4 border-b border-black/20 pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                Billed to
              </p>
              <p className="font-semibold">{buyer?.name ?? 'Client'}</p>
              <p className="whitespace-pre-line">{buyer?.address ?? ''}</p>
              <p>{[buyer?.city, buyer?.state].filter(Boolean).join(', ')}</p>
              {buyer?.gstin && <p className="mt-1">GSTIN: {buyer.gstin}</p>}
            </div>
            <div>
              {isTax && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                    Place of supply
                  </p>
                  <p>
                    {invoice.place_of_supply_code} — {invoice.place_of_supply_name}
                  </p>
                </>
              )}
              {invoice.parent_invoice_id && (
                <p className="mt-1">
                  Against invoice: <span className="font-medium">see reference</span>
                </p>
              )}
            </div>
          </section>

          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-b border-black/30 text-left">
                <th className="py-1 pr-2 font-semibold">#</th>
                <th className="py-1 pr-2 font-semibold">Description</th>
                <th className="py-1 pr-2 font-semibold">HSN/SAC</th>
                <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                <th className="py-1 pr-2 text-right font-semibold">Rate</th>
                <th className="py-1 pr-2 text-right font-semibold">Taxable</th>
                {isTax &&
                  (intrastate ? (
                    <>
                      <th className="py-1 pr-2 text-right font-semibold">CGST</th>
                      <th className="py-1 pr-2 text-right font-semibold">SGST</th>
                    </>
                  ) : (
                    <th className="py-1 pr-2 text-right font-semibold">IGST</th>
                  ))}
                <th className="py-1 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-black/10 align-top">
                  <td className="py-1 pr-2">{line.line_no}</td>
                  <td className="py-1 pr-2">{line.description}</td>
                  <td className="py-1 pr-2">{line.hsn_sac ?? '—'}</td>
                  <td className="py-1 pr-2 text-right">
                    {line.quantity} {line.unit}
                  </td>
                  <td className="py-1 pr-2 text-right">{formatINR(line.rate, true)}</td>
                  <td className="py-1 pr-2 text-right">{formatINR(line.taxable_value, true)}</td>
                  {isTax &&
                    (intrastate ? (
                      <>
                        <td className="py-1 pr-2 text-right">
                          {line.gst_rate / 2}% {formatINR(line.cgst_amount, true)}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {line.gst_rate / 2}% {formatINR(line.sgst_amount, true)}
                        </td>
                      </>
                    ) : (
                      <td className="py-1 pr-2 text-right">
                        {line.gst_rate}% {formatINR(line.igst_amount, true)}
                      </td>
                    ))}
                  <td className="py-1 text-right font-medium">
                    {formatINR(line.line_total, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="mt-3 flex justify-end">
            <dl className="w-64 space-y-1">
              <div className="flex justify-between">
                <dt>Taxable value</dt>
                <dd>{formatINR(invoice.taxable_value, true)}</dd>
              </div>
              {isTax && intrastate && (
                <>
                  <div className="flex justify-between">
                    <dt>CGST</dt>
                    <dd>{formatINR(invoice.cgst_amount, true)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>SGST</dt>
                    <dd>{formatINR(invoice.sgst_amount, true)}</dd>
                  </div>
                </>
              )}
              {isTax && !intrastate && invoice.igst_amount > 0 && (
                <div className="flex justify-between">
                  <dt>IGST</dt>
                  <dd>{formatINR(invoice.igst_amount, true)}</dd>
                </div>
              )}
              {Number(invoice.round_off) !== 0 && (
                <div className="flex justify-between">
                  <dt>Rounding</dt>
                  <dd>{formatINR(invoice.round_off, true)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-black/30 pt-1 text-sm font-bold">
                <dt>Grand total</dt>
                <dd>{formatINR(invoice.grand_total, true)}</dd>
              </div>
            </dl>
          </section>

          {invoice.amount_in_words && (
            <p className="mt-2 border-t border-black/20 pt-2">
              <span className="text-black/60">Amount in words:</span>{' '}
              <span className="font-medium">{invoice.amount_in_words}</span>
            </p>
          )}

          <footer className="mt-4 flex items-end justify-between gap-6 border-t border-black/20 pt-3">
            <div className="space-y-2">
              {supplier?.bank_name && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                    Bank details
                  </p>
                  <p>
                    {supplier.bank_name}
                    {supplier.bank_branch ? `, ${supplier.bank_branch}` : ''}
                  </p>
                  <p>
                    A/c {supplier.bank_account_no ?? '—'} · IFSC {supplier.bank_ifsc ?? '—'}
                  </p>
                </div>
              )}
              {invoice.notes && <p className="max-w-md">{invoice.notes}</p>}
              {invoice.terms && (
                <div className="max-w-md">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                    Terms
                  </p>
                  <p className="whitespace-pre-line">{invoice.terms}</p>
                </div>
              )}
            </div>

            <div className="shrink-0 text-center">
              <p className="mb-10">For {supplier?.legal_name ?? ''}</p>
              <p className="border-t border-black/40 pt-1">
                {supplier?.signatory_name ?? ''}
                <br />
                <span className="text-[10px]">
                  {supplier?.signatory_designation ?? 'Authorised Signatory'}
                </span>
              </p>
            </div>
          </footer>
        </article>
      ))}
    </div>
  )
}
