import { notFound } from 'next/navigation'
import { PrintableDocument } from '@/components/documents/printable-document'
import { INVOICE_COPIES, type InvoiceCopy } from '@/lib/constants'
import { requireProfile } from '@/lib/auth'
import { getDocument } from '@/lib/queries/documents'

export const dynamic = 'force-dynamic'

/**
 * The document on its own, with no application around it.
 *
 * Deliberately outside the `(app)` route group so it inherits none of the
 * shell — no sidebar, no header, no toolbar to hide with `print:hidden`. This
 * is what the PDF route renders headlessly, and it is the same
 * `PrintableDocument` component the screen uses. One layout, so paper and
 * screen cannot drift.
 *
 * Still behind the middleware gate, and it calls `requireProfile()` besides:
 * a document is a customer's commercial record and this route must not become
 * the one page that hands it to anyone with the id.
 */
export default async function PrintDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  await requireProfile()

  const detail = await getDocument(id)
  if (!detail) notFound()

  const { invoice, lines, settings, company, contact } = detail

  // Which copies to render, passed through from the button so a download
  // matches what the toolbar was showing. Anything unrecognised falls back to
  // the original alone rather than printing three copies by accident.
  const requested = (Array.isArray(query.copies) ? query.copies[0] : query.copies) ?? ''
  const copies = requested
    .split(',')
    .filter((value): value is InvoiceCopy => value in INVOICE_COPIES)

  return (
    <main className="bg-white">
      <PrintableDocument
        invoice={invoice}
        lines={lines}
        settings={settings}
        buyerFallback={
          company
            ? {
                name: company.name,
                address: company.address,
                city: company.city,
                state: company.state,
                gstin: company.gstin,
                contact_name: contact?.name ?? null,
                contact_phone: contact?.phone ?? null,
              }
            : null
        }
        copies={copies.length > 0 ? copies : ['original']}
      />
    </main>
  )
}
