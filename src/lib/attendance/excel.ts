import 'server-only'

import writeExcelFile, { type CellObject, type Row, type Sheet } from 'write-excel-file/node'
import type { DayResult } from '@/lib/attendance/compute'
import { DAY_EXCEL, DAY_LEGEND, PUNCH_SOURCE } from '@/lib/attendance/labels'
import {
  WEEKDAY_LETTER,
  WEEKDAY_SHORT,
  formatMonth,
  isoWeekday,
  minutesToHours,
  minutesToTime,
  type IsoDate,
  type IsoMonth,
} from '@/lib/attendance/time'
import type { PersonMonth } from '@/lib/queries/attendance'

/**
 * The attendance register as an .xlsx file: what the owner asked for as "all
 * the data in an Excel sheet with proper labels and times".
 *
 * Four sheets, all from the same computed month the screen shows:
 *   Register       one row a person, one column a day, coloured, with totals
 *   Daily details  one row a person-day: in, out, hours, late, overtime, notes
 *   Punches        every punch, where it came from
 *   Leave          the month's leave
 *
 * Times are written as text ("09:25"), hours as numbers with two decimals, so
 * they sort and add up in Excel without anyone reformatting them.
 */

const HEAD: CellObject = {
  fontWeight: 'bold',
  backgroundColor: '#1F2A44',
  textColor: '#FFFFFF',
  align: 'center',
  alignVertical: 'center',
  wrap: true,
  borderColor: '#9AA3B2',
  borderStyle: 'thin',
}

function head(value: string, extra: CellObject = {}): CellObject {
  return { ...HEAD, ...extra, value, type: String }
}

function text(value: string | null | undefined, extra: CellObject = {}): CellObject {
  return { value: value ?? '', type: String, borderColor: '#D5D9E0', borderStyle: 'thin', ...extra }
}

function num(value: number, extra: CellObject = {}): CellObject {
  return { value, type: Number, align: 'right', borderColor: '#D5D9E0', borderStyle: 'thin', ...extra }
}

function clock(minutes: number | null): string {
  return minutes === null ? '' : minutesToTime(minutes)
}

function dayDate(date: IsoDate): string {
  // dd/mm/yyyy, as dates are written in India.
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}

function markCell(day: DayResult): CellObject {
  if (!day.code) return text('', { align: 'center', textColor: '#BBBBBB' })
  const tone = DAY_EXCEL[day.code]
  return text(day.mark, {
    align: 'center',
    fontWeight: 'bold',
    backgroundColor: tone.fill,
    textColor: day.isLate ? '#B42318' : tone.text,
    ...(day.isLate ? { textDecoration: { underline: true } } : {}),
  })
}

export type LeaveSheetRow = {
  personName: string
  deviceCode: string
  typeCode: string
  typeName: string
  from: IsoDate
  to: IsoDate
  halfDay: boolean
  days: number
  status: string
  reason: string | null
  decidedBy: string | null
}

export async function buildRegisterWorkbook(input: {
  company: string
  month: IsoMonth
  days: IsoDate[]
  results: PersonMonth[]
  holidays: Map<IsoDate, string>
  leaves: LeaveSheetRow[]
  generatedAt: string
}): Promise<Buffer> {
  const { company, month, days, results, holidays, leaves, generatedAt } = input
  const totals: [string, (r: PersonMonth) => number][] = [
    ['Present', (r) => r.summary.present],
    ['Half days', (r) => r.summary.halfDays],
    ['Absent', (r) => r.summary.absent],
    ['Paid leave', (r) => r.summary.paidLeave],
    ['Unpaid leave', (r) => r.summary.unpaidLeave],
    ['On duty', (r) => r.summary.onDuty],
    ['Holidays', (r) => r.summary.holidays],
    ['Weekly offs', (r) => r.summary.weeklyOffs],
    ['Missed punches', (r) => r.summary.missedPunches],
    ['Late marks', (r) => r.summary.lateMarks],
    ['Late deduction (days)', (r) => r.summary.lateDeduction],
    ['Hours worked', (r) => minutesToHours(r.summary.workedMinutes)],
    ['Overtime hours', (r) => minutesToHours(r.summary.overtimeMinutes)],
    ['Payable days', (r) => r.summary.payableDays],
  ]
  const width = 3 + days.length + totals.length

  // ---- Register --------------------------------------------------------
  const register: Row[] = [
    [{ value: `${company} — Attendance register`, type: String, fontWeight: 'bold', fontSize: 14, columnSpan: width }],
    [{ value: `${formatMonth(month)} · generated ${generatedAt} IST`, type: String, textColor: '#555555', columnSpan: width }],
    [],
    [
      head('Emp no'),
      head('Name'),
      head('Shift'),
      ...days.map((d) =>
        head(String(Number(d.slice(8, 10))), holidays.has(d) || isoWeekday(d) === 7 ? { backgroundColor: '#55607A' } : {})
      ),
      ...totals.map(([label]) => head(label, { backgroundColor: '#2E4A3A' })),
    ],
    [
      head(''),
      head(''),
      head(''),
      ...days.map((d) => head(WEEKDAY_LETTER[isoWeekday(d)] ?? '', holidays.has(d) || isoWeekday(d) === 7 ? { backgroundColor: '#55607A' } : {})),
      ...totals.map(() => head('', { backgroundColor: '#2E4A3A' })),
    ],
  ]
  for (const r of results) {
    register.push([
      text(r.person.device_code, { align: 'center' }),
      text(r.person.full_name + (r.person.is_active ? '' : ' (stopped)'), { fontWeight: 'bold' }),
      text(r.person.shift.name),
      ...r.days.map(markCell),
      ...totals.map(([label, value]) => num(value(r), label === 'Payable days' ? { fontWeight: 'bold', backgroundColor: '#E3F4EA' } : {})),
    ])
  }
  register.push([], [{ value: 'Key', type: String, fontWeight: 'bold' }])
  for (const [code, meaning] of DAY_LEGEND) register.push([text(code, { fontWeight: 'bold', align: 'center' }), { value: meaning, type: String, columnSpan: 12 }])
  register.push([text('Red, underlined', { textColor: '#B42318', textDecoration: { underline: true } }), { value: 'Came in late', type: String, columnSpan: 12 }])
  const holidayList = [...holidays.entries()].filter(([d]) => d.startsWith(month))
  if (holidayList.length) {
    register.push([], [{ value: 'Holidays this month', type: String, fontWeight: 'bold', columnSpan: 6 }])
    for (const [d, name] of holidayList) register.push([text(dayDate(d)), { value: name, type: String, columnSpan: 8 }])
  }

  // ---- Daily details -----------------------------------------------------
  const details: Row[] = [
    [
      head('Date'),
      head('Day'),
      head('Emp no'),
      head('Name'),
      head('Shift'),
      head('Status'),
      head('Mark'),
      head('In'),
      head('Out'),
      head('Hours worked'),
      head('Late by (min)'),
      head('Left early by (min)'),
      head('Overtime (min)'),
      head('Punches'),
      head('Note'),
    ],
  ]
  for (const date of days) {
    for (const r of results) {
      const d = r.days.find((x) => x.date === date)!
      if (!d.code && d.punches.length === 0) continue
      details.push([
        text(dayDate(date)),
        text(WEEKDAY_SHORT[d.weekday]),
        text(r.person.device_code, { align: 'center' }),
        text(r.person.full_name),
        text(r.person.shift.name),
        text(d.label + (d.overridden ? ' (marked by admin)' : '')),
        markCell(d),
        text(clock(d.firstIn), { align: 'center' }),
        text(clock(d.lastOut), { align: 'center' }),
        d.workedMinutes === null ? text('') : num(minutesToHours(d.workedMinutes), { format: '0.00' }),
        d.isLate ? num(d.lateMinutes, { textColor: '#B42318' }) : text(''),
        d.earlyMinutes ? num(d.earlyMinutes) : text(''),
        d.overtimeMinutes ? num(d.overtimeMinutes) : text(''),
        text(d.punches.map((p) => clock(p.minutes)).join(', ')),
        text(d.note ?? (d.workedOnOffDay ? 'Worked on a holiday / weekly off' : '')),
      ])
    }
  }

  // ---- Punches ------------------------------------------------------------
  const punchList: { key: string; row: Row }[] = []
  for (const r of results) {
    for (const d of r.days) {
      for (const p of d.punches) {
        punchList.push({
          key: `${d.date} ${clock(p.minutes)} ${r.person.full_name}`,
          row: [
            text(dayDate(d.date)),
            text(clock(p.minutes), { align: 'center' }),
            text(r.person.device_code, { align: 'center' }),
            text(r.person.full_name),
            text(PUNCH_SOURCE[p.source as keyof typeof PUNCH_SOURCE] ?? p.source),
            text(p.note),
          ],
        })
      }
    }
  }
  punchList.sort((a, b) => a.key.localeCompare(b.key))
  const punchRows: Row[] = [
    [head('Date'), head('Time'), head('Emp no'), head('Name'), head('Came from'), head('Note')],
    ...punchList.map((p) => p.row),
  ]

  // ---- Leave --------------------------------------------------------------
  const leaveRows: Row[] = [
    [head('Name'), head('Emp no'), head('Type'), head('From'), head('To'), head('Days'), head('Status'), head('Reason'), head('Decided by')],
  ]
  for (const l of leaves) {
    leaveRows.push([
      text(l.personName),
      text(l.deviceCode, { align: 'center' }),
      text(`${l.typeCode} — ${l.typeName}`),
      text(dayDate(l.from)),
      text(dayDate(l.to)),
      num(l.days),
      text(l.status),
      text(l.reason),
      text(l.decidedBy),
    ])
  }
  if (leaves.length === 0) leaveRows.push([text('No leave this month', { columnSpan: 9 })])

  const sheets: Sheet<Buffer>[] = [
    {
      sheet: 'Register',
      data: register,
      stickyRowsCount: 5,
      stickyColumnsCount: 2,
      orientation: 'landscape',
      columns: [{ width: 8 }, { width: 24 }, { width: 12 }, ...days.map(() => ({ width: 4.5 })), ...totals.map(() => ({ width: 10 }))],
    },
    {
      sheet: 'Daily details',
      data: details,
      stickyRowsCount: 1,
      columns: [
        { width: 11 },
        { width: 6 },
        { width: 8 },
        { width: 22 },
        { width: 12 },
        { width: 24 },
        { width: 7 },
        { width: 7 },
        { width: 7 },
        { width: 9 },
        { width: 9 },
        { width: 10 },
        { width: 10 },
        { width: 26 },
        { width: 36 },
      ],
    },
    { sheet: 'Punches', data: punchRows, stickyRowsCount: 1, columns: [{ width: 11 }, { width: 7 }, { width: 8 }, { width: 22 }, { width: 16 }, { width: 40 }] },
    {
      sheet: 'Leave',
      data: leaveRows,
      stickyRowsCount: 1,
      columns: [{ width: 22 }, { width: 8 }, { width: 26 }, { width: 11 }, { width: 11 }, { width: 6 }, { width: 11 }, { width: 36 }, { width: 18 }],
    },
  ]

  return writeExcelFile(sheets, { fontFamily: 'Calibri', fontSize: 10 }).toBuffer()
}
