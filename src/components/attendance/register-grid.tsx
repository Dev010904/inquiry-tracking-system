import Link from 'next/link'
import { DayMark } from '@/components/attendance/day-mark'
import type { PersonMonth } from '@/lib/queries/attendance'
import { DAY_LEGEND } from '@/lib/attendance/labels'
import { WEEKDAY_LETTER, isoWeekday, minutesToHours, type IsoDate } from '@/lib/attendance/time'
import { cn } from '@/lib/utils'

/**
 * The month as a register: one row a person, one column a day, the totals
 * payroll needs at the end. The same figures go into the Excel file.
 */
export function RegisterGrid({
  days,
  results,
  holidays,
  today,
}: {
  days: IsoDate[]
  results: PersonMonth[]
  holidays: Map<IsoDate, string>
  today: IsoDate
}) {
  const totals: [string, (r: PersonMonth) => number | string, string][] = [
    ['P', (r) => r.summary.present, 'Present (including missed punches)'],
    ['HD', (r) => r.summary.halfDays, 'Half days'],
    ['A', (r) => r.summary.absent, 'Absent'],
    ['L', (r) => r.summary.paidLeave + r.summary.unpaidLeave, 'Leave days'],
    ['OD', (r) => r.summary.onDuty, 'On duty'],
    ['H+WO', (r) => r.summary.holidays + r.summary.weeklyOffs, 'Holidays and weekly offs'],
    ['Late', (r) => r.summary.lateMarks, 'Late marks'],
    ['Hours', (r) => minutesToHours(r.summary.workedMinutes), 'Hours worked'],
    ['OT', (r) => minutesToHours(r.summary.overtimeMinutes), 'Overtime hours'],
    ['Pay days', (r) => r.summary.payableDays, 'Payable days'],
  ]

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-10 min-w-[11rem] border-b border-r bg-muted px-2 py-2 text-left font-medium">Name</th>
              {days.map((d) => {
                const weekday = isoWeekday(d)
                const holiday = holidays.get(d)
                return (
                  <th
                    key={d}
                    title={holiday}
                    className={cn(
                      'w-9 border-b px-0.5 py-1 text-center font-medium',
                      (weekday === 7 || holiday) && 'text-muted-foreground',
                      d === today && 'bg-primary/10 text-primary'
                    )}
                  >
                    <div className="tnum">{Number(d.slice(8, 10))}</div>
                    <div className="text-[10px] font-normal">{WEEKDAY_LETTER[weekday]}</div>
                  </th>
                )
              })}
              {totals.map(([label, , title]) => (
                <th key={label} title={title} className="border-b border-l px-2 py-2 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.person.id} className="border-b last:border-0 hover:bg-muted/30">
                <th scope="row" className="sticky left-0 z-10 border-r bg-card px-2 py-1.5 text-left font-normal">
                  <Link href={`/attendance/people/${r.person.id}`} className="font-medium hover:underline">
                    {r.person.full_name}
                  </Link>
                  <div className="text-[11px] text-muted-foreground">
                    #{r.person.device_code} · {r.person.shift.name}
                    {!r.person.is_active && ' · stopped'}
                  </div>
                </th>
                {r.days.map((d) => (
                  <td key={d.date} className={cn('px-0.5 py-1 text-center', d.date === today && 'bg-primary/5')}>
                    <DayMark day={d} className="min-w-[1.9rem] text-[11px]" />
                  </td>
                ))}
                {totals.map(([label, value]) => (
                  <td
                    key={label}
                    className={cn('border-l px-2 py-1.5 text-right tnum', label === 'Pay days' && 'font-semibold')}
                  >
                    {value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {DAY_LEGEND.map(([code, meaning]) => (
          <li key={code}>
            <span className="font-semibold text-foreground">{code}</span> {meaning}
          </li>
        ))}
        <li>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-overdue align-middle" aria-hidden />
          late
        </li>
      </ul>
    </div>
  )
}
