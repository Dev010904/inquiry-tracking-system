import Link from 'next/link'
import { History, MessageSquareQuote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatAudit } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ACTIVITY_SECTIONS, activityHref, type ActivitySection } from '@/lib/queries/activity'
import type { ActivityFeedRow } from '@/types/database'

/** Deletions are worth spotting at a glance; the rest are routine. */
function actionVariant(row: ActivityFeedRow) {
  const s = row.summary ?? ''
  if (s.includes(' deleted')) return 'overdue' as const
  if (row.action === 'insert') return 'ok' as const
  return 'muted' as const
}

function actionLabel(row: ActivityFeedRow) {
  const s = row.summary ?? ''
  if (s.includes('permanently deleted')) return 'Deleted'
  if (s.includes(' deleted')) return 'Deleted'
  if (s.includes(' restored')) return 'Restored'
  if (row.action === 'insert') return 'Created'
  return 'Changed'
}

export function ActivityFeed({ rows, filtered }: { rows: ActivityFeedRow[]; filtered: boolean }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={filtered ? 'Nothing matches those filters' : 'No changes recorded yet'}
        description={
          filtered
            ? 'Try widening the period, or clearing the person and section filters.'
            : 'Every change anyone makes will appear here, with who made it and exactly when.'
        }
      />
    )
  }

  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const href = activityHref(row)
        const section = ACTIVITY_SECTIONS[row.table_name as ActivitySection] ?? row.table_name

        return (
          <li key={row.id} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex shrink-0 items-center gap-2 sm:w-28">
              <Badge variant={actionVariant(row)}>{actionLabel(row)}</Badge>
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm">
                {href ? (
                  <Link href={href} className="font-medium hover:underline">
                    {row.summary ?? 'Change recorded'}
                  </Link>
                ) : (
                  <span className="font-medium">{row.summary ?? 'Change recorded'}</span>
                )}
              </p>

              {row.note && (
                <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-sm">
                  <MessageSquareQuote
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{row.note}</span>
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                <span className={cn(row.actor_name === 'System' && 'italic')}>{row.actor_name}</span>
                {' · '}
                {section}
                {' · '}
                <time dateTime={row.created_at}>{formatAudit(row.created_at)}</time>
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
