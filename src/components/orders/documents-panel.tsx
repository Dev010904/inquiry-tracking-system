import Link from 'next/link'
import { FileText } from 'lucide-react'
import { RaiseDocument } from '@/components/documents/raise-document'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DOCUMENT_STATUS, DOCUMENT_TYPE } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import type { DocumentStatus, InvoiceRow } from '@/types/database'

type Props = {
  orderId: string
  documents: InvoiceRow[]
  parents: InvoiceRow[]
  gstApplicable: boolean
  defaultStateCode: string | null
  /** Lines with no HSN/SAC block a tax invoice, so warn before they try. */
  linesMissingHsn: number
}

const STATUS_VARIANT: Record<DocumentStatus, 'ok' | 'muted' | 'overdue'> = {
  draft: 'muted',
  issued: 'ok',
  cancelled: 'overdue',
}

/** Every document raised against this order, and the button to raise another. */
export function DocumentsPanel({
  orderId,
  documents,
  parents,
  gstApplicable,
  defaultStateCode,
  linesMissingHsn,
}: Props) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          Documents
        </CardTitle>
        <RaiseDocument
          orderId={orderId}
          gstApplicable={gstApplicable}
          parents={parents}
          defaultStateCode={defaultStateCode}
        />
      </CardHeader>

      <CardContent className="space-y-3">
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing raised yet. A proforma is the usual first document; a tax invoice follows once
            the work is done.
          </p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/documents/${doc.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 hover:opacity-80"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {doc.doc_no ?? `${DOCUMENT_TYPE[doc.doc_type]} — draft`}
                      </span>
                      <Badge variant={STATUS_VARIANT[doc.status]}>
                        {DOCUMENT_STATUS[doc.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPE[doc.doc_type]} · {formatDate(doc.doc_date)}
                    </p>
                  </div>
                  <span className="tnum text-sm font-medium">
                    {formatMoney(doc.grand_total, 'INR', true)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {linesMissingHsn > 0 && gstApplicable && (
          <p className="text-xs text-overdue">
            {linesMissingHsn} line{linesMissingHsn === 1 ? '' : 's'} still have no HSN/SAC code. A
            proforma or challan can be issued, but a tax invoice cannot.
          </p>
        )}

        {!gstApplicable && (
          <p className="text-xs text-muted-foreground">
            This client is marked as not GST-applicable, so they receive a bill of supply rather
            than a tax invoice.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
