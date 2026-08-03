import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { AlarmPanel } from '@/components/dashboard/alarm-panel'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { RecentInquiries } from '@/components/dashboard/recent-inquiries'
import { buttonVariants } from '@/components/ui/button'
import { getAlarms, getKpis, getRecentInquiries } from '@/lib/queries/dashboard'

export const metadata: Metadata = { title: 'Dashboard · Inquiry Tracking System' }

/** Deadlines must be current, so nothing on this page is cached. */
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const now = new Date()

  // All three run at once. The overdue KPI is taken from the alarms result
  // rather than re-counted, so nothing has to wait on anything else — with
  // the database a round trip away, sequential queries are what make a page
  // feel slow.
  const [alarms, kpiTotals, recent] = await Promise.all([
    getAlarms(now),
    getKpis(now),
    getRecentInquiries(8),
  ])

  const kpis = { ...kpiTotals, overdueFollowups: alarms.overdueCount }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Today</h2>
          <p className="text-sm text-muted-foreground">
            Deadlines first, then the numbers.
          </p>
        </div>
        <Link href="/inquiries/new" className={buttonVariants({ size: 'default' })}>
          <Plus className="h-4 w-4" aria-hidden />
          New inquiry
        </Link>
      </div>

      <KpiCards kpis={kpis} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <AlarmPanel alarms={alarms} />
        <RecentInquiries inquiries={recent} />
      </div>
    </div>
  )
}
