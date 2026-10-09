import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MonthNav } from '@/components/attendance/month-nav'
import { PersonMonthTable } from '@/components/attendance/person-month-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatClock, formatDuration, formatMonth, isIsoMonth, istToday, timeToMinutes } from '@/lib/attendance/time'
import { requireProfile } from '@/lib/auth'
import { currentAccess } from '@/lib/permissions'
import { getLeaveTypes, getMonth } from '@/lib/queries/attendance'

export const metadata: Metadata = { title: 'Attendance · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

/** One person's month. Their own for anyone; anybody's for an admin. */
export default async function PersonMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Search>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()

  const today = istToday()
  const current = today.slice(0, 7)
  const asked = Array.isArray(query.month) ? query.month[0] : query.month
  const month = isIsoMonth(asked) && asked <= current ? asked : current

  const [profile, { features }, data, leaveTypes] = await Promise.all([
    requireProfile(),
    currentAccess(),
    getMonth(month, id),
    getLeaveTypes(),
  ])
  // Not found, rather than "not allowed": the database returned nothing either way.
  const row = data.results[0]
  if (!row) notFound()
  const { person, days, summary } = row
  const isAdmin = profile.role === 'admin'
  const isMe = person.profile_id === profile.id

  const tiles: [string, string | number][] = [
    ['Present', summary.present],
    ['On duty', summary.onDuty],
    ['Half days', summary.halfDays],
    ['Absent', summary.absent],
    ['Leave', summary.paidLeave + summary.unpaidLeave],
    ['Late marks', summary.lateMarks],
    ['Missed punches', summary.missedPunches],
    ['Hours worked', formatDuration(summary.workedMinutes)],
    ['Overtime', formatDuration(summary.overtimeMinutes)],
    ['Payable days', summary.payableDays],
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {person.full_name}
            {!person.is_active && <Badge variant="muted">Not tracked now</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            Device no. {person.device_code} · {person.shift.name} shift {formatClock(timeToMinutes(person.shift.start_time))}–
            {formatClock(timeToMinutes(person.shift.end_time))} · on attendance from {person.tracked_from}
          </p>
        </div>
        <MonthNav month={month} basePath={`/attendance/people/${person.id}`} current={current} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{formatMonth(month)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tnum text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {summary.lateDeduction > 0 && (
            <p className="text-sm text-muted-foreground">
              {summary.lateMarks} late marks cost {summary.lateDeduction} day{summary.lateDeduction === 1 ? '' : 's'} under the
              shift&rsquo;s rule; payable days already allow for it.
            </p>
          )}
          <PersonMonthTable
            personId={person.id}
            days={days}
            isAdmin={isAdmin}
            canRequest={isMe && features.attendance.canEdit}
            leaveTypes={leaveTypes.filter((t) => t.is_active).map((t) => ({ id: t.id, code: t.code, name: t.name }))}
            today={today}
          />
        </CardContent>
      </Card>
    </div>
  )
}
