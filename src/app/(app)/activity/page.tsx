import type { Metadata } from 'next'
import { ActivityFeed } from '@/components/activity/activity-feed'
import { ActivityFilters } from '@/components/activity/activity-filters'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import {
  ACTIVITY_SECTIONS,
  activityActors,
  listActivity,
  type ActivitySection,
} from '@/lib/queries/activity'

export const metadata: Metadata = { title: 'Recent changes · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s || undefined
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams

  const sectionParam = one(params.section)
  const section =
    sectionParam && sectionParam in ACTIVITY_SECTIONS ? (sectionParam as ActivitySection) : undefined

  // Defaults to the last 24 hours: the question this screen answers is almost
  // always "what changed recently", not "what has ever happened".
  const daysParam = one(params.days)
  const days = daysParam !== undefined ? Number(daysParam) : 1
  const safeDays = [0, 1, 7, 30].includes(days) ? days : 1

  const pageParam = Number(one(params.page) ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1

  const [actors, result] = await Promise.all([
    activityActors(),
    listActivity({ actorId: one(params.who), section, days: safeDays, page }),
  ])

  const filtered = Boolean(one(params.who) || section || safeDays === 0)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Recent changes</h2>
        <p className="text-sm text-muted-foreground">
          Everything anyone has changed, with who did it and exactly when. Times are shown in IST
          so everyone reads the same clock.
        </p>
      </div>

      <ActivityFilters actors={actors} />

      <Card className="overflow-hidden">
        <ActivityFeed rows={result.rows} filtered={filtered} />
      </Card>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        noun="change"
        nounPlural="changes"
      />
    </div>
  )
}
