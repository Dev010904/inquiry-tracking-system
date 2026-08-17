import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { AlarmPanel } from '@/components/dashboard/alarm-panel'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { RecentChanges } from '@/components/dashboard/recent-changes'
import { RecentInquiries } from '@/components/dashboard/recent-inquiries'
import { buttonVariants } from '@/components/ui/button'
import { MyWorkDashboard } from '@/components/dashboard/my-work-dashboard'
import { getAlarms, getKpis, getRecentInquiries } from '@/lib/queries/dashboard'
import { recentActivity } from '@/lib/queries/activity'
import { getMyFollowups } from '@/lib/queries/my-work'
import { getMyTasks } from '@/lib/queries/tasks'
import { currentAccess } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Dashboard · Inquiry Tracking System' }

/** Deadlines must be current, so nothing on this page is cached. */
export const dynamic = 'force-dynamic'

/**
 * One route, two dashboards, chosen on the server.
 *
 * Someone whose role withholds `dashboard` gets My work instead: their own
 * tasks and their own follow-ups, no money and no company-wide counts. The
 * branch happens before any commercial query is issued, so those figures are
 * never fetched for such a user — rendering them and hiding them with CSS
 * would still put every number into the HTML for anyone who reads the source.
 */
export default async function DashboardPage() {
  const { profile, features } = await currentAccess()

  if (!features.dashboard.canView) {
    const [tasks, followups] = await Promise.all([
      getMyTasks(profile.id),
      getMyFollowups(profile.id),
    ])

    return (
      <MyWorkDashboard
        fullName={profile.full_name}
        tasks={tasks}
        followups={followups}
        canOpenInquiries={features.inquiries.canView}
      />
    )
  }

  const now = new Date()

  // All four run at once. The overdue KPI is taken from the alarms result
  // rather than re-counted, so nothing has to wait on anything else — with
  // the database a round trip away, sequential queries are what make a page
  // feel slow.
  const [alarms, kpiTotals, recent, changes] = await Promise.all([
    getAlarms(now),
    getKpis(now),
    getRecentInquiries(8),
    recentActivity(5),
  ])

  const kpis = { ...kpiTotals, overdueFollowups: alarms.overdueCount }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Today</h2>
          <p className="text-sm text-muted-foreground">
            What is due, what has come in, and what has changed.
          </p>
        </div>
        <Link href="/inquiries/new" className={buttonVariants({ size: 'default' })}>
          <Plus className="h-4 w-4" aria-hidden />
          New inquiry
        </Link>
      </div>

      <KpiCards kpis={kpis} />

      {/* Recent inquiries left, alarms right, at the owner's request. The alarm
          panel keeps its red header and larger controls so that moving it does
          not also make it easy to overlook. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-5">
          <RecentInquiries inquiries={recent} />
          <RecentChanges rows={changes} />
        </div>
        <AlarmPanel alarms={alarms} />
      </div>
    </div>
  )
}
