import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, ChevronRight, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { DOCUMENT_TYPE, DOCUMENT_STATUS } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import {
  listDocuments,
  documentTypeCounts,
  getCompanySettings,
  missingSettings,
} from '@/lib/queries/documents'
import type { DocumentStatus, DocumentType } from '@/types/database'

export const metadata: Metadata = { title: 'Documents · ANK Inquiry Tracking' }
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

  // No type in the URL means nobody has chosen one yet, so the page is the
  // picker rather than an undifferentiated list of everything. `all` is the
  // explicit way to ask for that list, so the old behaviour is still one click
  // away rather than gone.
  const chosen = one(params.type)
  const showPicker = !chosen

  const [result, counts, settings] = await Promise.all([
    showPicker
      ? Promise.resolve(null)
      : listDocuments({
          status: one(params.status) as DocumentStatus | undefined,
          docType: chosen === 'all' ? undefined : (chosen as DocumentType),
          page,
        }),
    documentTypeCounts(),
    getCompanySettings(),
  ])

  const missing = missingSettings(settings)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          {showPicker
            ? 'Documents'
            : chosen === 'all'
              ? 'All documents'
              : DOCUMENT_TYPE[chosen as DocumentType]}
        </h2>
        <p className="text-sm text-muted-foreground">
          {showPicker
            ? 'Quotations, proformas, tax invoices, bills of supply, delivery challans and notes. Pick the kind you are looking for.'
            : 'Documents are raised from an inquiry or an order, so the lines always match what was quoted or sold.'}
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

      {showPicker ? (
        /*
         * The picker.
         *
         * Every type is listed even at zero, rather than only the ones already
         * used: the list is what tells somebody new what this system can
         * produce. A count of nothing is information — it says none has been
         * raised this year, not that the option does not exist.
         */
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(DOCUMENT_TYPE) as DocumentType[]).map((type) => (
            <Link
              key={type}
              href={`/documents?type=${type}`}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium">{DOCUMENT_TYPE[type]}</p>
                  <p className="text-xs text-muted-foreground">
                    {counts[type] === 0
                      ? 'None this year'
                      : `${counts[type]} this year`}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}

          <Link
            href="/documents?type=all"
            className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 transition-colors hover:border-primary/50 sm:col-span-2"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="font-medium">Everything, newest first</p>
                <p className="text-xs text-muted-foreground">
                  {total === 0 ? 'Nothing raised this year' : `${total} this year`}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All document types
      </Link>

      <Card className="overflow-hidden">
        {result!.rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="None of these yet"
            description="Documents are raised from an inquiry or an order — open one and use Quotation or Raise document."
          />
        ) : (
          <ul className="divide-y">
            {result!.rows.map((row) => (
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
        page={result!.page}
        pageCount={result!.pageCount}
        total={result!.total}
        noun="document"
        nounPlural="documents"
      />
        </>
      )}
    </div>
  )
}
