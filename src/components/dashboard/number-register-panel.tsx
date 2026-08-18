import { AlertTriangle, FileX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatDateTimeIST } from '@/lib/format'
import type { DocumentNumberRegisterRow } from '@/types/database'

/**
 * The state of the statutory number series, on the admin dashboard.
 *
 * Nothing about a broken series should first become visible on filing day.
 * This was the owner's own idea and it is a good one.
 *
 * The wording is the point of the panel, and it deliberately does not say what
 * he first suggested. He asked it to prompt "add another invoice in this
 * number". Reusing a cancelled number would put two different documents under
 * one number for the life of the business — far worse than the gap it closes,
 * and it breaks the uniqueness Rule 46(b) requires. The correct treatment is
 * to report the number as cancelled, where it is fully accounted for. So the
 * panel states the fact and the required action, in language whoever files the
 * return can act on without asking anybody.
 */
export function NumberRegisterPanel({ rows }: { rows: DocumentNumberRegisterRow[] }) {
  const cancelled = rows.filter((r) => r.kind === 'cancelled')
  const missing = rows.filter((r) => r.kind === 'missing')

  if (rows.length === 0) return null

  return (
    <Card className="border-overdue/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base text-overdue">
          <FileX className="h-4 w-4" aria-hidden />
          Numbers to account for when filing
          <Badge variant="overdue">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {missing.length > 0 && (
          <section>
            <div className="flex items-center gap-2 px-1 pb-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-overdue">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Unaccounted for — investigate
              </h3>
              <Badge variant="overdue">{missing.length}</Badge>
            </div>
            <ul className="divide-y overflow-hidden rounded-md border border-overdue/40">
              {missing.map((row) => (
                <li key={`${row.doc_type}-${row.fy}-${row.seq_number}`} className="bg-overdue/5 p-3">
                  <p className="font-medium">{row.doc_no}</p>
                  <p className="text-sm text-muted-foreground">
                    This number was taken from the series but no document carries it. That should
                    not be possible. Find out what happened before filing — do not issue anything
                    against it.
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {cancelled.length > 0 && (
          <section>
            <div className="flex items-center gap-2 px-1 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cancelled
              </h3>
              <Badge variant="muted">{cancelled.length}</Badge>
            </div>
            <ul className="divide-y overflow-hidden rounded-md border">
              {cancelled.map((row) => (
                <li key={`${row.doc_type}-${row.fy}-${row.seq_number}`} className="p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="font-medium line-through decoration-overdue/60">{row.doc_no}</p>
                    <Badge variant="overdue">Cancelled</Badge>
                    {row.doc_date && (
                      <span className="text-sm text-muted-foreground">
                        {formatDate(row.doc_date)}
                      </span>
                    )}
                    {row.company_name && (
                      <span className="text-sm text-muted-foreground">· {row.company_name}</span>
                    )}
                  </div>

                  {row.cancel_reason && (
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Reason:</span> {row.cancel_reason}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cancelled by {row.cancelled_by_name ?? 'an earlier user'}
                    {row.cancelled_at ? ` · ${formatDateTimeIST(row.cancelled_at)}` : ''}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-2 rounded-md border border-overdue/30 bg-overdue/5 p-2.5 text-sm">
              <span className="font-medium">What to do with these.</span> Report each one to the
              portal as a cancelled invoice for its period — that is where a cancelled number is
              properly accounted for, and an assessor expects to find it there.{' '}
              <span className="font-medium">Do not reuse the number.</span> Issuing a second
              document under a number that has already been used puts two different invoices
              under one number for good. If the supply still has to be invoiced, it takes a new
              number: open the cancelled document and use Duplicate, then issue the copy.
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
