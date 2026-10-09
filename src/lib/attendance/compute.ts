/**
 * What each day was for each person, and what a month adds up to.
 *
 * Pure: everything it needs is passed in, so the same code produces the screen,
 * the register and the Excel file, and they cannot disagree.
 *
 * Order of precedence for a day, first match wins:
 *   1. outside tracking (before the person's start date, or in the future) → blank
 *   2. an admin's ruling on the day (attendance_day_overrides)
 *   3. a holiday            → H, even if they worked (the hours count as overtime)
 *   4. their weekly off     → WO, likewise
 *   5. approved leave       → the leave type's code; "on duty" counts as present
 *   6. the punches:
 *        none                          → A (or "not in yet" today, before the shift ends)
 *        one                           → MP, a missed punch to correct
 *        first to last ≥ full day      → P
 *        first to last ≥ half day      → HD
 *        less                          → A
 *   Late is first punch after start + grace; early is last punch before the end.
 */

import { addDays, fyBounds, isoWeekday, istParts, timeToMinutes, type IsoDate } from './time'

export type DayCode =
  | 'P' // present
  | 'HD' // half day
  | 'A' // absent
  | 'L' // leave (the leave type's code is shown instead)
  | 'HL' // half-day leave
  | 'OD' // on duty
  | 'H' // holiday
  | 'WO' // weekly off
  | 'MP' // missed punch: only one punch that day
  | 'IN' // today, in and still working
  | 'NY' // today, not in yet
  | '' // not counted: before tracking started, or a future day

export type ShiftRule = {
  id: string
  name: string
  start_time: string
  end_time: string
  grace_minutes: number
  half_day_minutes: number
  full_day_minutes: number
  weekly_offs: number[]
  late_marks_per_half_day: number
  overtime_after_minutes: number
}

export type LeaveTypeRule = {
  id: string
  code: string
  name: string
  is_paid: boolean
  counts_as_present: boolean
  yearly_quota: number | null
}

export type PunchIn = { id: string; punched_at: string; source: string; note: string | null }
export type LeaveIn = { id: string; leave_type_id: string; from_date: string; to_date: string; half_day: boolean }
export type OverrideIn = { work_date: string; status: string; leave_type_id: string | null; note: string }

export type PersonIn = {
  id: string
  tracked_from: string
  is_active: boolean
  shift: ShiftRule
}

export type DayPunch = { id: string; minutes: number; source: string; note: string | null }

export type DayResult = {
  date: IsoDate
  weekday: number
  code: DayCode
  /** What the register cell shows: the code, or the leave type's code ("CL", "CL½"). */
  mark: string
  label: string
  leaveTypeCode: string | null
  firstIn: number | null
  lastOut: number | null
  workedMinutes: number | null
  lateMinutes: number
  earlyMinutes: number
  overtimeMinutes: number
  isLate: boolean
  workedOnOffDay: boolean
  overridden: boolean
  note: string | null
  punches: DayPunch[]
  /** Payable value of the day: 0, 0.5 or 1. */
  paid: number
}

export type MonthSummary = {
  present: number
  halfDays: number
  absent: number
  paidLeave: number
  unpaidLeave: number
  onDuty: number
  holidays: number
  weeklyOffs: number
  missedPunches: number
  lateMarks: number
  /** Days taken off for repeated late marks, when the shift has that rule. */
  lateDeduction: number
  workedMinutes: number
  overtimeMinutes: number
  payableDays: number
  /** Days that counted: from the start date up to today. */
  countedDays: number
  /** Leave taken this month by type code (half days as 0.5). */
  leaveByType: Record<string, number>
}

export const DAY_LABEL: Record<Exclude<DayCode, ''>, string> = {
  P: 'Present',
  HD: 'Half day',
  A: 'Absent',
  L: 'Leave',
  HL: 'Half-day leave',
  OD: 'On duty',
  H: 'Holiday',
  WO: 'Weekly off',
  MP: 'Missed punch',
  IN: 'In',
  NY: 'Not in yet',
}

export type Context = {
  today: IsoDate
  /** Minutes since midnight IST now; decides "not in yet" against "absent". */
  nowMinutes: number
  holidays: Map<IsoDate, string>
  leaveTypes: Map<string, LeaveTypeRule>
}

/** Group punches by IST day, minutes in order. */
export function punchesByDay(punches: PunchIn[]): Map<IsoDate, DayPunch[]> {
  const out = new Map<IsoDate, DayPunch[]>()
  for (const p of punches) {
    const { date, minutes } = istParts(p.punched_at)
    const list = out.get(date) ?? []
    list.push({ id: p.id, minutes, source: p.source, note: p.note })
    out.set(date, list)
  }
  for (const list of out.values()) list.sort((a, b) => a.minutes - b.minutes)
  return out
}

/** The approved leave covering a day, if any. */
function leaveOn(date: IsoDate, leaves: LeaveIn[]): LeaveIn | undefined {
  return leaves.find((l) => l.from_date <= date && l.to_date >= date)
}

function blank(date: IsoDate, punches: DayPunch[]): DayResult {
  return {
    date,
    weekday: isoWeekday(date),
    code: '',
    mark: '',
    label: '',
    leaveTypeCode: null,
    firstIn: null,
    lastOut: null,
    workedMinutes: null,
    lateMinutes: 0,
    earlyMinutes: 0,
    overtimeMinutes: 0,
    isLate: false,
    workedOnOffDay: false,
    overridden: false,
    note: null,
    punches,
    paid: 0,
  }
}

export function computeDay(
  person: PersonIn,
  date: IsoDate,
  dayPunches: DayPunch[],
  leaves: LeaveIn[],
  override: OverrideIn | undefined,
  ctx: Context
): DayResult {
  const shift = person.shift
  const r = blank(date, dayPunches)
  if (date < person.tracked_from || date > ctx.today) return r

  const start = timeToMinutes(shift.start_time)
  const end = timeToMinutes(shift.end_time)
  const isToday = date === ctx.today
  const shiftOver = !isToday || ctx.nowMinutes >= end

  // Times from the punches, whatever the day turns out to be.
  if (dayPunches.length > 0) {
    r.firstIn = dayPunches[0]!.minutes
    if (dayPunches.length > 1) {
      r.lastOut = dayPunches[dayPunches.length - 1]!.minutes
      r.workedMinutes = r.lastOut - r.firstIn
    }
  }
  const stillIn = isToday && !shiftOver && dayPunches.length % 2 === 1

  const set = (code: DayCode, paid: number, label?: string, mark?: string) => {
    r.code = code
    r.paid = paid
    r.label = label ?? (code ? DAY_LABEL[code] : '')
    r.mark = mark ?? code
  }

  const timing = () => {
    if (r.firstIn !== null && r.firstIn > start + shift.grace_minutes) {
      r.isLate = true
      r.lateMinutes = r.firstIn - start
    }
    if (r.lastOut !== null && r.lastOut < end && !stillIn) r.earlyMinutes = end - r.lastOut
    if (r.workedMinutes !== null && !stillIn) {
      const extra = r.workedMinutes - (end - start)
      if (extra >= shift.overtime_after_minutes && extra > 0) r.overtimeMinutes = extra
    }
  }

  const offDay = (code: 'H' | 'WO', label: string) => {
    set(code, 1, label)
    if (r.workedMinutes !== null && r.workedMinutes > 0) {
      r.workedOnOffDay = true
      if (r.workedMinutes >= shift.overtime_after_minutes) r.overtimeMinutes = r.workedMinutes
    }
  }

  const fromPunches = () => {
    if (dayPunches.length === 0) {
      if (isToday && !shiftOver) set('NY', 0)
      else if (!person.is_active) set('', 0)
      else set('A', 0)
      return
    }
    if (stillIn) {
      set('IN', 1)
      timing()
      return
    }
    if (dayPunches.length === 1) {
      set('MP', 1)
      timing()
      return
    }
    const worked = r.workedMinutes ?? 0
    if (worked >= shift.full_day_minutes) set('P', 1)
    else if (worked >= shift.half_day_minutes) set('HD', 0.5)
    else set('A', 0, 'Absent (too few hours)')
    timing()
  }

  // 2. An admin's ruling.
  if (override) {
    r.overridden = true
    r.note = override.note
    switch (override.status) {
      case 'present':
        set('P', 1)
        timing()
        return r
      case 'half_day':
        set('HD', 0.5)
        timing()
        return r
      case 'absent':
        set('A', 0)
        return r
      case 'on_duty':
        set('OD', 1)
        return r
      case 'holiday':
        offDay('H', 'Holiday')
        return r
      case 'weekly_off':
        offDay('WO', 'Weekly off')
        return r
      case 'leave': {
        const type = override.leave_type_id ? ctx.leaveTypes.get(override.leave_type_id) : undefined
        if (type?.counts_as_present) set('OD', 1, type.name, type.code)
        else set('L', type?.is_paid === false ? 0 : 1, type?.name ?? 'Leave', type?.code ?? 'L')
        r.leaveTypeCode = type?.code ?? null
        return r
      }
    }
  }

  // 3–4. Holidays and weekly offs.
  const holiday = ctx.holidays.get(date)
  if (holiday) {
    offDay('H', holiday)
    return r
  }
  if (shift.weekly_offs.includes(r.weekday)) {
    offDay('WO', 'Weekly off')
    return r
  }

  // 5. Approved leave.
  const leave = leaveOn(date, leaves)
  if (leave) {
    const type = ctx.leaveTypes.get(leave.leave_type_id)
    r.leaveTypeCode = type?.code ?? null
    if (type?.counts_as_present) {
      set('OD', 1, type.name, type.code)
      timing()
      return r
    }
    const leavePaid = type?.is_paid === false ? 0 : 1
    if (leave.half_day) {
      const worked = r.workedMinutes ?? 0
      const workedHalf = worked >= shift.half_day_minutes ? 0.5 : 0
      set('HL', leavePaid * 0.5 + workedHalf, `Half-day ${type?.name.toLowerCase() ?? 'leave'}`, `${type?.code ?? 'L'}½`)
      return r
    }
    set('L', leavePaid, type?.name ?? 'Leave', type?.code ?? 'L')
    return r
  }

  // 6. The punches.
  fromPunches()
  return r
}

export function computeMonth(
  person: PersonIn,
  days: IsoDate[],
  byDay: Map<IsoDate, DayPunch[]>,
  leaves: LeaveIn[],
  overrides: Map<IsoDate, OverrideIn>,
  ctx: Context
): { days: DayResult[]; summary: MonthSummary } {
  const results = days.map((d) => computeDay(person, d, byDay.get(d) ?? [], leaves, overrides.get(d), ctx))
  return { days: results, summary: summarise(person.shift, results, ctx) }
}

export function summarise(shift: ShiftRule, days: DayResult[], ctx: Context): MonthSummary {
  const s: MonthSummary = {
    present: 0,
    halfDays: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    onDuty: 0,
    holidays: 0,
    weeklyOffs: 0,
    missedPunches: 0,
    lateMarks: 0,
    lateDeduction: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
    payableDays: 0,
    countedDays: 0,
    leaveByType: {},
  }
  for (const d of days) {
    if (d.code === '') continue
    s.countedDays += 1
    s.payableDays += d.paid
    if (d.workedMinutes) s.workedMinutes += d.workedMinutes
    s.overtimeMinutes += d.overtimeMinutes
    if (d.isLate && (d.code === 'P' || d.code === 'HD' || d.code === 'MP' || d.code === 'IN')) s.lateMarks += 1
    switch (d.code) {
      case 'P':
      case 'IN':
        s.present += 1
        break
      case 'MP':
        s.present += 1
        s.missedPunches += 1
        break
      case 'HD':
        s.halfDays += 1
        break
      case 'A':
        s.absent += 1
        break
      case 'OD':
        s.onDuty += 1
        break
      case 'H':
        s.holidays += 1
        break
      case 'WO':
        s.weeklyOffs += 1
        break
      case 'L':
      case 'HL': {
        const amount = d.code === 'HL' ? 0.5 : 1
        const type = d.leaveTypeCode ? [...ctx.leaveTypes.values()].find((t) => t.code === d.leaveTypeCode) : undefined
        if (type?.is_paid === false) s.unpaidLeave += amount
        else s.paidLeave += amount
        if (d.leaveTypeCode) s.leaveByType[d.leaveTypeCode] = (s.leaveByType[d.leaveTypeCode] ?? 0) + amount
        break
      }
    }
  }
  if (shift.late_marks_per_half_day > 0) {
    s.lateDeduction = Math.floor(s.lateMarks / shift.late_marks_per_half_day) * 0.5
    s.payableDays = Math.max(0, s.payableDays - s.lateDeduction)
  }
  return s
}

/**
 * Leave days a request uses: holidays and the person's weekly offs inside it do
 * not count, and a half-day request is 0.5.
 */
export function leaveDays(leave: { from_date: string; to_date: string; half_day: boolean }, shift: ShiftRule, holidays: Map<IsoDate, string>): number {
  if (leave.half_day) return 0.5
  let n = 0
  for (let d = leave.from_date; d <= leave.to_date; d = addDays(d, 1)) {
    if (holidays.has(d)) continue
    if (shift.weekly_offs.includes(isoWeekday(d))) continue
    n += 1
  }
  return n
}

export type LeaveBalance = {
  type: LeaveTypeRule
  used: number
  pending: number
  /** null when the type has no yearly limit. */
  left: number | null
}

/** Leave used and left this financial year, per type. */
export function leaveBalances(
  types: LeaveTypeRule[],
  leaves: (LeaveIn & { status: string })[],
  shift: ShiftRule,
  holidays: Map<IsoDate, string>,
  on: IsoDate
): LeaveBalance[] {
  const fy = fyBounds(on)
  return types.map((type) => {
    let used = 0
    let pending = 0
    for (const l of leaves) {
      if (l.leave_type_id !== type.id) continue
      // Only the part of a request inside this financial year.
      const from = l.from_date < fy.from ? fy.from : l.from_date
      const to = l.to_date > fy.to ? fy.to : l.to_date
      if (from > to) continue
      const days = leaveDays({ from_date: from, to_date: to, half_day: l.half_day }, shift, holidays)
      if (l.status === 'approved') used += days
      else if (l.status === 'pending') pending += days
    }
    return { type, used, pending, left: type.yearly_quota === null ? null : Math.max(0, type.yearly_quota - used) }
  })
}
