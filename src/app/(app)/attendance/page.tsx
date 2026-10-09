import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Fingerprint, Settings2, Wifi, WifiOff } from 'lucide-react'
import { DayMark } from '@/components/attendance/day-mark'
import { CorrectionRequestButton, LeaveRequestButton } from '@/components/attendance/request-forms'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { DAY_LABEL } from '@/lib/attendance/compute'
import { formatClock, formatDayLong, formatDuration, formatMonth, istToday, timeToMinutes } from '@/lib/attendance/time'
import { requireProfile } from '@/lib/auth'
import {
  getBalances,
  getLeaveTypes,
  getMonth,
  getMyPerson,
  getPeople,
  getSetup,
  getToday,
  lastSeenLabel,
} from '@/lib/queries/attendance'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Attendance · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

/**
 * Today. An admin sees everyone — who is in, who is late, who has not come —
 * and whether the device is talking to the system. Anyone on attendance sees
 * their own day, their month so far and the leave they have left.
 */
export default async function AttendanceTodayPage() {
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'
  const today = istToday()

  const [me, leaveTypes] = await Promise.all([getMyPerson(), getLeaveTypes()])

  if (!me && !isAdmin) {
    return (
      <Card>
        <EmptyState
          icon={Fingerprint}
          title="You are not on attendance yet"
          description="An admin adds people under Attendance → Setup, with the number they are enrolled under on the fingerprint device."
        />
      </Card>
    )
  }

  const activeTypes = leaveTypes.filter((t) => t.is_active).map((t) => ({ id: t.id, code: t.code, name: t.name }))
  const [mine, balances, board, setup, people] = await Promise.all([
    me ? getMonth(today.slice(0, 7), me.id) : null,
    me ? getBalances(me) : [],
    isAdmin ? getToday() : null,
    isAdmin ? getSetup() : null,
    isAdmin ? getPeople() : [],
  ])
  const myMonth = mine?.results[0] ?? null
  const myDay = myMonth?.days.find((d) => d.date === today) ?? null
  const personOptions = people.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.full_name }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground">{formatDayLong(today)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LeaveRequestButton isAdmin={isAdmin} people={personOptions} myPersonId={me?.id ?? null} leaveTypes={activeTypes} defaultDate={today} />
          <CorrectionRequestButton isAdmin={isAdmin} people={personOptions} myPersonId={me?.id ?? null} defaultDate={today} today={today} />
        </div>
      </div>

      {me && myMonth && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My day</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                {myDay && <DayMark day={myDay} className="px-2 py-1 text-sm" />}
                <span className="font-medium">{myDay?.label || (myDay?.code ? DAY_LABEL[myDay.code] : '—')}</span>
                {myDay?.isLate && <Badge variant="overdue">Late by {formatDuration(myDay.lateMinutes)}</Badge>}
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">In</dt>
                  <dd className="tnum font-medium">{formatClock(myDay?.firstIn)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Out</dt>
                  <dd className="tnum font-medium">{formatClock(myDay?.lastOut)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Worked</dt>
                  <dd className="tnum font-medium">{formatDuration(myDay?.workedMinutes)}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Shift {me.shift.name}: {formatClock(timeToMinutes(me.shift.start_time))}–{formatClock(timeToMinutes(me.shift.end_time))} ·
                device no. {me.device_code}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <CardTitle className="text-base">{formatMonth(today.slice(0, 7))} so far</CardTitle>
              <Link href={`/attendance/people/${me.id}`} className="text-sm text-primary hover:underline">
                Day by day
              </Link>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                {[
                  ['Present', myMonth.summary.present],
                  ['Half days', myMonth.summary.halfDays],
                  ['Absent', myMonth.summary.absent],
                  ['Leave / on duty', myMonth.summary.paidLeave + myMonth.summary.unpaidLeave + myMonth.summary.onDuty],
                  ['Late marks', myMonth.summary.lateMarks],
                  ['Missed punches', myMonth.summary.missedPunches],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tnum text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leave left this year</CardTitle>
            </CardHeader>
            <CardContent>
              {balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave types are set up.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {balances.map((b) => (
                    <li key={b.type.id} className="flex items-baseline justify-between gap-2">
                      <span>
                        <span className="font-medium">{b.type.code}</span>{' '}
                        <span className="text-muted-foreground">{b.type.name}</span>
                      </span>
                      <span className="tnum">
                        {b.left === null ? `${b.used} used` : <><span className="font-semibold">{b.left}</span> of {b.type.yearly_quota}</>}
                        {b.pending > 0 && <span className="ml-1 text-xs text-muted-foreground">({b.pending} waiting)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {isAdmin && board && setup && <TodayBoard board={board} setup={setup} />}
    </div>
  )
}

function TodayBoard({
  board,
  setup,
}: {
  board: Awaited<ReturnType<typeof getToday>>
  setup: Awaited<ReturnType<typeof getSetup>>
}) {
  const rows = board.rows
  const count = (codes: string[]) => rows.filter((r) => codes.includes(r.day.code)).length
  const late = rows.filter((r) => r.day.isLate).length
  const tiles = [
    { label: 'In / present', value: count(['IN', 'P', 'MP', 'HD']), tone: 'text-ok' },
    { label: 'Late', value: late, tone: late ? 'text-overdue' : '' },
    { label: 'Not in yet', value: count(['NY']), tone: '' },
    { label: 'Absent', value: count(['A']), tone: count(['A']) ? 'text-overdue' : '' },
    { label: 'Leave / on duty', value: count(['L', 'HL', 'OD']), tone: '' },
  ]
  const activeDevices = setup.devices.filter((d) => d.status === 'active')
  const waitingDevices = setup.devices.filter((d) => d.status === 'pending')

  if (setup.people.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Settings2}
          title="Nobody is on attendance yet"
          description="Add people with their device numbers, check the office timings, and connect the fingerprint device."
          actionLabel="Open setup"
          actionHref="/attendance/setup"
        />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Everyone today</CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {activeDevices.length === 0 ? (
              <Link href="/attendance/setup#devices" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <WifiOff className="h-4 w-4" aria-hidden />
                No device connected
              </Link>
            ) : (
              activeDevices.map((d) => {
                const seen = lastSeenLabel(d.last_seen_at)
                return (
                  <span key={d.id} className={cn('inline-flex items-center gap-1.5', seen.online ? 'text-ok' : 'text-muted-foreground')}>
                    {seen.online ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
                    {d.name}: {seen.text}
                  </span>
                )
              })
            )}
          </div>
        </div>
        {board.holiday && <p className="text-sm text-muted-foreground">Today is a holiday: {board.holiday.name}.</p>}
        {(waitingDevices.length > 0 || setup.unmatched.length > 0) && (
          <Link
            href="/attendance/setup"
            className="flex items-start gap-2 rounded-md border border-duesoon/40 bg-duesoon/10 p-3 text-sm hover:bg-duesoon/15"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-duesoon" aria-hidden />
            <span>
              {waitingDevices.length > 0 && `${waitingDevices.length} device${waitingDevices.length === 1 ? ' is' : 's are'} waiting for approval. `}
              {setup.unmatched.length > 0 &&
                `Punches from ${setup.unmatched.length} device number${setup.unmatched.length === 1 ? '' : 's'} nobody has yet (${setup.unmatched
                  .slice(0, 4)
                  .map((u) => u.code)
                  .join(', ')}). `}
              Open setup to sort this out.
            </span>
          </Link>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className={cn('tnum text-2xl font-semibold', t.tone)}>{t.value}</dd>
            </div>
          ))}
        </dl>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">In</th>
                <th className="py-2 font-medium">Out</th>
                <th className="py-2 text-right font-medium">Worked</th>
                <th className="py-2 text-right font-medium">Late by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, day }) => (
                <tr key={person.id} className="border-b last:border-0">
                  <td className="py-2">
                    <Link href={`/attendance/people/${person.id}`} className="font-medium hover:underline">
                      {person.full_name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">#{person.device_code}</span>
                  </td>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <DayMark day={day} />
                      <span className="text-muted-foreground">{day.label}</span>
                    </span>
                  </td>
                  <td className="py-2 tnum">{formatClock(day.firstIn)}</td>
                  <td className="py-2 tnum">{formatClock(day.lastOut)}</td>
                  <td className="py-2 text-right tnum">{formatDuration(day.workedMinutes)}</td>
                  <td className={cn('py-2 text-right tnum', day.isLate && 'font-medium text-overdue')}>
                    {day.isLate ? formatDuration(day.lateMinutes) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end">
          <Link href="/attendance/register" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Month register and Excel
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
