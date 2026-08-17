import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AcceptQuotation } from '@/components/documents/accept-quotation'
import { DocumentLinesEditor } from '@/components/documents/document-lines-editor'
import { DocumentView } from '@/components/documents/document-view'
import { Badge } from '@/components/ui/badge'
import { DOCUMENT_TYPE, TAX_DISPLAYING_DOCUMENT_TYPES } from '@/lib/constants'
import { formatAudit } from '@/lib/format'
import { requireProfile } from '@/lib/auth'
import { getDocument } from '@/lib/queries/documents'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getDocument(id)
  return {
    title: `${detail?.invoice.doc_no ?? 'Draft document'} · ANK Inquiry Tracking`,
  }
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [profile, detail] = await Promise.all([requireProfile(), getDocument(id)])
  if (!detail) notFound()

  const { invoice, lines, settings, order } = detail

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="print:hidden">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to invoices
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">
            {invoice.doc_no ?? `${DOCUMENT_TYPE[invoice.doc_type]} — draft`}
          </h2>
          <Badge
            variant={
              invoice.status === 'issued' ? 'ok' : invoice.status === 'cancelled' ? 'overdue' : 'muted'
            }
          >
            {invoice.status}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          {DOCUMENT_TYPE[invoice.doc_type]}
          {order?.order_no && (
            <>
              {' · from '}
              <Link href={`/orders/${order.id}`} className="text-primary hover:underline">
                {order.order_no}
              </Link>
            </>
          )}
          {invoice.issued_at && <> · issued {formatAudit(invoice.issued_at)}</>}
        </p>

        {invoice.status === 'cancelled' && invoice.cancel_reason && (
          <p className="mt-2 rounded-md border border-overdue/40 bg-overdue/5 px-3 py-2 text-sm">
            <span className="font-medium text-overdue">Cancelled:</span> {invoice.cancel_reason}
          </p>
        )}
      </div>

      {/* Only a draft can be edited, and only the database enforces that. This
          is here so a quotation — which is raised empty, against an inquiry —
          can be given its lines at all. */}
      {invoice.status === 'draft' && (
        <div className="print:hidden">
          <DocumentLinesEditor
            invoiceId={invoice.id}
            lines={lines}
            defaultGstRate={Number(settings?.default_gst_rate ?? 18)}
            showsTax={TAX_DISPLAYING_DOCUMENT_TYPES.includes(invoice.doc_type)}
          />
        </div>
      )}

      {invoice.doc_type === 'quotation' && invoice.status === 'issued' && !order && (
        <div className="print:hidden">
          <AcceptQuotation quotationId={invoice.id} />
        </div>
      )}

      <DocumentView
        invoice={invoice}
        lines={lines}
        settings={settings}
        isAdmin={profile.role === 'admin'}
      />
    </div>
  )
}
