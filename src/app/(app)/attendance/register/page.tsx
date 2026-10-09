import type { Metadata } from 'next'
import { Download, Fingerprint } from 'lucide-react'
import { MonthNav } from '@/components/attendance/month-nav'
import { RegisterGrid } from '@/components/attendance/register-grid'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatMonth, isIsoMonth, istToday } from '@/lib/attendance/time'
import { requireProfile } from '@/lib/auth'
import { getMonth } from '@/lib/queries/attendance'

export const metadata: Metadata = { title: 'Attendance register · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

/**
 * The month register. An admin sees everyone; anyone else sees their own row
 * (the database decides — the query simply gets fewer rows).
 */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const today = istToday()
  const current = today.slice(0, 7)
  const asked = Array.isArray(params.month) ? params.month[0] : params.month
  const month = isIsoMonth(asked) && asked <= current ? asked : current

  const profile = await requireProfile()
  const data = await getMonth(month)
  const holidays = new Map(data.holidays.map((h) => [h.holiday_on, h.name]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Register · {formatMonth(month)}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.role === 'admin' ? 'Everyone on attendance.' : 'Your attendance.'} Click a name to see each day and
            its punches.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MonthNav month={month} basePath="/attendance/register" current={current} />
          <a
            href={`/attendance/register/download?month=${month}`}
            className={buttonVariants({ variant: 'default' })}
            download
          >
            <Download className="h-4 w-4" aria-hidden />
            Download Excel
          </a>
        </div>
      </div>

      {data.results.length === 0 ? (
        <Card>
          <EmptyState
            icon={Fingerprint}
            title="Nobody to show for this month"
            description="People appear here from the day they are put on attendance."
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 sm:pt-5">
            <RegisterGrid days={data.range.days} results={data.results} holidays={holidays} today={today} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
