import Link from 'next/link'
import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatAudit } from '@/lib/format'
import { activityHref } from '@/lib/queries/activity'
import type { ActivityFeedRow } from '@/types/database'

/**
 * A short "what just happened" strip. The point is not completeness — it is
 * that a change nobody expected is noticed the same day rather than a month
 * later when the numbers disagree.
 */
export function RecentChanges({ rows }: { rows: ActivityFeedRow[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          Recent changes
        </CardTitle>
        <Link href="/activity" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nothing has changed yet.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const href = activityHref(row)
              return (
                <li key={row.id} className="py-2 first:pt-0 last:pb-0">
                  {href ? (
                    <Link href={href} className="text-sm hover:underline">
                      {row.summary ?? 'Change recorded'}
                    </Link>
                  ) : (
                    <span className="text-sm">{row.summary ?? 'Change recorded'}</span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {row.actor_name} · {formatAudit(row.created_at)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
