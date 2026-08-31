import Link from 'next/link'
import { FileText } from 'lucide-react'
import { RaiseQuotation } from '@/components/inquiries/raise-quotation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DOCUMENT_STATUS, DOCUMENT_TYPE } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import type { DocumentStatus, InvoiceRow } from '@/types/database'

type Props = {
  inquiryId: string
  documents: InvoiceRow[]
  /** The client's own state, used as the default place of supply. */
  defaultStateCode: string | null
  /** True once the inquiry has become an order — changes what the empty state says. */
  hasOrder: boolean
}

const STATUS_VARIANT: Record<DocumentStatus, 'ok' | 'muted' | 'overdue'> = {
  draft: 'muted',
  issued: 'ok',
  cancelled: 'overdue',
}

/**
 * Every document connected to this inquiry, and the button to raise another.
 *
 * The same panel the order screen has, at the owner's request, and for the same
 * reason: the question "what have we actually sent this customer" was
 * answerable from an order but not from the inquiry the order came out of. A
 * quotation is raised against an inquiry, so the inquiry was the one screen
 * where a quotation could be created and then never seen again.
 *
 * It lists documents raised against the order too, once there is one. They are
 * the same conversation with the same customer, and which record a document
 * happens to hang off is not something anyone should have to know.
 */
export function InquiryDocuments({ inquiryId, documents, defaultStateCode, hasOrder }: Props) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          Documents
        </CardTitle>
        <RaiseQuotation inquiryId={inquiryId} defaultStateCode={defaultStateCode} />
      </CardHeader>

      <CardContent>
        {documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {hasOrder
              ? 'Nothing raised yet. Quote from here, or raise a proforma or invoice on the order.'
              : 'Nothing raised yet. A quotation is what goes out before anything is agreed.'}
          </p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/documents/${doc.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 hover:opacity-80"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* A cancelled document is struck through rather than
                          hidden — the number stays in the series and that is
                          the point of it. */}
                      <span
                        className={
                          doc.status === 'cancelled'
                            ? 'text-sm font-medium line-through decoration-overdue/60'
                            : 'text-sm font-medium'
                        }
                      >
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
                  <span
                    className={
                      doc.status === 'cancelled'
                        ? 'tnum text-sm font-medium text-muted-foreground line-through'
                        : 'tnum text-sm font-medium'
                    }
                  >
                    {formatMoney(doc.grand_total, 'INR', true)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
