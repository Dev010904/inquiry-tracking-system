import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { DOCUMENT_TYPE, DOCUMENT_STATUS } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { listDocuments, getCompanySettings, missingSettings } from '@/lib/queries/documents'
import type { DocumentStatus, DocumentType } from '@/types/database'

export const metadata: Metadata = { title: 'Invoices · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s || undefined
}

const STATUS_VARIANT: Record<DocumentStatus, 'ok' | 'muted' | 'overdue'> = {
  draft: 'muted',
  issued: 'ok',
  cancelled: 'overdue',
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams
  const page = Math.max(1, Number(one(params.page) ?? '1') || 1)

  const [result, settings] = await Promise.all([
    listDocuments({
      status: one(params.status) as DocumentStatus | undefined,
      docType: one(params.type) as DocumentType | undefined,
      page,
    }),
    getCompanySettings(),
  ])

  const missing = missingSettings(settings)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Invoices &amp; documents</h2>
        <p className="text-sm text-muted-foreground">
          Proformas, tax invoices, bills of supply, delivery challans and notes. Documents are
          raised from an order, so the lines always match what was sold.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-overdue/40 bg-overdue/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-overdue" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-overdue">Nothing can be issued yet</p>
            <p className="text-muted-foreground">
              Company &amp; tax details are incomplete — still needed: {missing.join(', ')}. An
              admin can fill these in under{' '}
              <Link href="/settings" className="text-primary hover:underline">
                Settings
              </Link>
              . Drafts can be prepared in the meantime.
            </p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Open an order and use Raise document to create a proforma or an invoice."
          />
        ) : (
          <ul className="divide-y">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/documents/${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* A cancelled document is struck through and its total
                          greyed, so the list reads the way a deletion would
                          without anything actually being removed. The number
                          stays visible because that is the point of it. */}
                      <span
                        className={
                          row.status === 'cancelled'
                            ? 'font-medium line-through decoration-overdue/60'
                            : 'font-medium'
                        }
                      >
                        {row.doc_no ?? `${DOCUMENT_TYPE[row.doc_type]} — draft`}
                      </span>
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {DOCUMENT_STATUS[row.status]}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {DOCUMENT_TYPE[row.doc_type]} · {row.companyName ?? 'Unknown client'} ·{' '}
                      {formatDate(row.doc_date)}
                    </p>
                  </div>
                  <p
                    className={
                      row.status === 'cancelled'
                        ? 'tnum font-semibold text-muted-foreground line-through'
                        : 'tnum font-semibold'
                    }
                  >
                    {formatMoney(row.grand_total, 'INR', true)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        noun="document"
        nounPlural="documents"
      />
    </div>
  )
}
