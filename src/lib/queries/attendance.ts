import 'server-only'

import { cache } from 'react'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  computeMonth,
  leaveBalances,
  leaveDays,
  punchesByDay,
  type Context,
  type DayResult,
  type LeaveBalance,
  type MonthSummary,
  type OverrideIn,
  type PersonIn,
} from '@/lib/attendance/compute'
import { formatClock, fyBounds, istNowMinutes, istParts, istToday, monthRange, type IsoDate, type IsoMonth } from '@/lib/attendance/time'
import type {
  AttendanceCorrectionRow,
  AttendanceDeviceRow,
  AttendanceHolidayRow,
  AttendanceLeaveRow,
  AttendanceLeaveTypeRow,
  AttendancePersonRow,
  AttendancePunchRow,
  AttendanceShiftRow,
} from '@/types/database'

/** Someone on attendance, with their name and shift filled in. */
export type AttendancePerson = AttendancePersonRow & {
  full_name: string
  email: string | null
  shift: AttendanceShiftRow
}

export type PersonMonth = {
  person: AttendancePerson
  days: DayResult[]
  summary: MonthSummary
}

/** PostgREST hands back at most 1,000 rows a request. */
const PAGE = 1000

async function allPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

function asPersonIn(p: AttendancePerson): PersonIn {
  return { id: p.id, tracked_from: p.tracked_from, is_active: p.is_active, shift: p.shift }
}

export const getShifts = cache(async (): Promise<AttendanceShiftRow[]> => {
  const supabase = await createClient()
  const { data } = await supabase.from('attendance_shifts').select('*').order('is_default', { ascending: false }).order('name')
  return data ?? []
})

export const getLeaveTypes = cache(async (): Promise<AttendanceLeaveTypeRow[]> => {
  const supabase = await createClient()
  const { data } = await supabase.from('attendance_leave_types').select('*').order('sort_order').order('code')
  return data ?? []
})

async function getHolidays(from: IsoDate, to: IsoDate): Promise<AttendanceHolidayRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('attendance_holidays')
    .select('*')
    .gte('holiday_on', from)
    .lte('holiday_on', to)
    .order('holiday_on')
  return data ?? []
}

/**
 * Everyone this viewer may see on attendance: everybody for an admin, only
 * themselves for anyone else (the database's policy, not a filter here).
 */
export const getPeople = cache(async (): Promise<AttendancePerson[]> => {
  const supabase = await createClient()
  const [{ data: rows }, shifts] = await Promise.all([
    supabase.from('attendance_people').select('*'),
    getShifts(),
  ])
  if (!rows || rows.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', rows.map((r) => r.profile_id))
  const byProfile = new Map((profiles ?? []).map((p) => [p.id, p]))
  const byShift = new Map(shifts.map((s) => [s.id, s]))

  return rows
    .filter((r) => byShift.has(r.shift_id))
    .map((r) => ({
      ...r,
      full_name: byProfile.get(r.profile_id)?.full_name ?? 'Unknown',
      email: byProfile.get(r.profile_id)?.email ?? null,
      shift: byShift.get(r.shift_id)!,
    }))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name))
})

/** The signed-in person's own place on attendance, or null. */
export const getMyPerson = cache(async (): Promise<AttendancePerson | null> => {
  const profile = await requireProfile()
  return (await getPeople()).find((p) => p.profile_id === profile.id) ?? null
})

async function getPunches(personIds: string[], fromInstant: string, toInstant: string): Promise<AttendancePunchRow[]> {
  if (personIds.length === 0) return []
  const supabase = await createClient()
  return allPages<AttendancePunchRow>((from, to) =>
    supabase
      .from('attendance_punches')
      .select('*')
      .in('person_id', personIds)
      .gte('punched_at', fromInstant)
      .lt('punched_at', toInstant)
      .order('punched_at')
      .order('id')
      .range(from, to)
  )
}

function context(holidays: AttendanceHolidayRow[], leaveTypes: AttendanceLeaveTypeRow[]): Context {
  return {
    today: istToday(),
    nowMinutes: istNowMinutes(),
    holidays: new Map(holidays.map((h) => [h.holiday_on, h.name])),
    leaveTypes: new Map(leaveTypes.map((t) => [t.id, t])),
  }
}

/**
 * One month for everyone the viewer may see (or one person), computed.
 *
 * People who were not tracked at all during the month — started later, or
 * stopped before it and with no punches in it — are left out of the register.
 */
export async function getMonth(month: IsoMonth, personId?: string) {
  const range = monthRange(month)
  const supabase = await createClient()
  const [people, leaveTypes, holidays] = await Promise.all([
    getPeople(),
    getLeaveTypes(),
    getHolidays(range.from, range.to),
  ])
  const chosen = people.filter((p) => (personId ? p.id === personId : true) && p.tracked_from <= range.to)
  const ids = chosen.map((p) => p.id)

  const [punches, leaves, overrides] = await Promise.all([
    getPunches(ids, range.startInstant, range.endInstant),
    ids.length
      ? supabase
          .from('attendance_leaves')
          .select('*')
          .in('person_id', ids)
          .eq('status', 'approved')
          .lte('from_date', range.to)
          .gte('to_date', range.from)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as AttendanceLeaveRow[]),
    ids.length
      ? supabase
          .from('attendance_day_overrides')
          .select('*')
          .in('person_id', ids)
          .gte('work_date', range.from)
          .lte('work_date', range.to)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ])

  const ctx = context(holidays, leaveTypes)
  const results: PersonMonth[] = chosen
    .map((person) => {
      const own = punches.filter((p) => p.person_id === person.id)
      const overrideMap = new Map<IsoDate, OverrideIn>(
        overrides.filter((o) => o.person_id === person.id).map((o) => [o.work_date, o])
      )
      const { days, summary } = computeMonth(
        asPersonIn(person),
        range.days,
        punchesByDay(own),
        leaves.filter((l) => l.person_id === person.id),
        overrideMap,
        ctx
      )
      return { person, days, summary }
    })
    .filter((r) => r.person.is_active || r.days.some((d) => d.punches.length > 0 || d.overridden))

  return { month, range, results, holidays, leaveTypes, ctx }
}

/** Today for everyone the viewer may see. */
export async function getToday() {
  const today = istToday()
  const month = await getMonth(today.slice(0, 7))
  const rows = month.results
    .filter((r) => r.person.is_active)
    .map((r) => ({ person: r.person, day: r.days.find((d) => d.date === today)!, summary: r.summary }))
  return { today, rows, holiday: month.holidays.find((h) => h.holiday_on === today) ?? null }
}

/** Leave used and left this financial year for one person. */
export async function getBalances(person: AttendancePerson, on: IsoDate = istToday()): Promise<LeaveBalance[]> {
  const fy = fyBounds(on)
  const supabase = await createClient()
  const [leaveTypes, holidays, { data: leaves }] = await Promise.all([
    getLeaveTypes(),
    getHolidays(fy.from, fy.to),
    supabase
      .from('attendance_leaves')
      .select('*')
      .eq('person_id', person.id)
      .in('status', ['approved', 'pending'])
      .lte('from_date', fy.to)
      .gte('to_date', fy.from),
  ])
  return leaveBalances(
    leaveTypes.filter((t) => t.is_active && !t.counts_as_present),
    leaves ?? [],
    person.shift,
    new Map(holidays.map((h) => [h.holiday_on, h.name])),
    on
  )
}

export type LeaveRequest = AttendanceLeaveRow & {
  personName: string
  typeCode: string
  typeName: string
  decidedByName: string | null
  days: number
}

export type CorrectionRequest = AttendanceCorrectionRow & {
  personName: string
  decidedByName: string | null
}

/** Leave and correction requests: every pending one, and the last 90 days of decided ones. */
export async function getRequests() {
  const supabase = await createClient()
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [people, leaveTypes, { data: leaves }, { data: corrections }] = await Promise.all([
    getPeople(),
    getLeaveTypes(),
    supabase
      .from('attendance_leaves')
      .select('*')
      .or(`status.eq.pending,updated_at.gte.${since}`)
      .order('from_date', { ascending: false })
      .limit(300),
    supabase
      .from('attendance_corrections')
      .select('*')
      .or(`status.eq.pending,updated_at.gte.${since}`)
      .order('work_date', { ascending: false })
      .limit(300),
  ])

  const deciders = [...new Set([...(leaves ?? []), ...(corrections ?? [])].map((r) => r.decided_by).filter((v): v is string => !!v))]
  const { data: names } = deciders.length
    ? await supabase.from('profiles').select('id, full_name').in('id', deciders)
    : { data: [] as { id: string; full_name: string }[] }
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.full_name]))
  const personOf = new Map(people.map((p) => [p.id, p]))
  const typeOf = new Map(leaveTypes.map((t) => [t.id, t]))
  const fy = fyBounds(istToday())
  const holidayMap = new Map((await getHolidays(fy.from, fy.to)).map((h) => [h.holiday_on, h.name]))

  const leaveRows: LeaveRequest[] = (leaves ?? []).map((l) => {
    const person = personOf.get(l.person_id)
    return {
      ...l,
      personName: person?.full_name ?? 'Someone',
      typeCode: typeOf.get(l.leave_type_id)?.code ?? '?',
      typeName: typeOf.get(l.leave_type_id)?.name ?? 'Leave',
      decidedByName: l.decided_by ? nameOf.get(l.decided_by) ?? null : null,
      days: person ? leaveDays(l, person.shift, holidayMap) : 0,
    }
  })
  const correctionRows: CorrectionRequest[] = (corrections ?? []).map((c) => ({
    ...c,
    personName: personOf.get(c.person_id)?.full_name ?? 'Someone',
    decidedByName: c.decided_by ? nameOf.get(c.decided_by) ?? null : null,
  }))
  return { leaves: leaveRows, corrections: correctionRows, people, leaveTypes }
}

export type UnmatchedCode = { code: string; count: number; first: string; last: string }

/** Everything the admin's setup screen shows. */
export async function getSetup() {
  const supabase = await createClient()
  const year = istToday().slice(0, 4)
  const [people, shifts, leaveTypes, holidays, { data: devices }, { data: profiles }, unmatched] = await Promise.all([
    getPeople(),
    getShifts(),
    getLeaveTypes(),
    getHolidays(`${Number(year) - 1}-01-01`, `${Number(year) + 1}-12-31`),
    supabase.from('attendance_devices').select('*').order('created_at'),
    supabase.from('profiles').select('id, full_name, email, is_active').eq('is_hidden', false).order('full_name'),
    allPages<{ device_code: string; punched_at: string }>((from, to) =>
      supabase
        .from('attendance_punches')
        .select('device_code, punched_at')
        .is('person_id', null)
        .order('punched_at')
        .range(from, to)
    ),
  ])

  const codes = new Map<string, UnmatchedCode>()
  for (const p of unmatched) {
    const row = codes.get(p.device_code) ?? { code: p.device_code, count: 0, first: p.punched_at, last: p.punched_at }
    row.count += 1
    if (p.punched_at < row.first) row.first = p.punched_at
    if (p.punched_at > row.last) row.last = p.punched_at
    codes.set(p.device_code, row)
  }

  const onAttendance = new Set(people.map((p) => p.profile_id))
  return {
    people,
    shifts,
    leaveTypes,
    holidays,
    devices: (devices ?? []) as AttendanceDeviceRow[],
    candidates: (profiles ?? []).filter((p) => p.is_active && !onAttendance.has(p.id)),
    unmatched: [...codes.values()].sort((a, b) => b.last.localeCompare(a.last)),
  }
}

/** Counts for the badge on the Requests tab. */
export async function pendingRequestCount(): Promise<number> {
  const supabase = await createClient()
  const [{ count: l }, { count: c }] = await Promise.all([
    supabase.from('attendance_leaves').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('attendance_corrections').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  return (l ?? 0) + (c ?? 0)
}

/** The instant of the newest punch from a device, for "last punch received". */
export function lastSeenLabel(iso: string | null): { text: string; online: boolean } {
  if (!iso) return { text: 'Never connected', online: false }
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  const { date, minutes: m } = istParts(iso)
  const clock = formatClock(m)
  if (minutes < 3) return { text: 'Online now', online: true }
  if (minutes < 60) return { text: `Last seen ${minutes} min ago`, online: minutes < 5 }
  return { text: `Last seen ${date === istToday() ? 'today' : date} at ${clock}`, online: false }
}

/** The month's leave, for the Excel file: approved and still-waiting requests. */
export async function getMonthLeaves(month: IsoMonth) {
  const range = monthRange(month)
  const supabase = await createClient()
  const [people, leaveTypes, holidays, { data: leaves }] = await Promise.all([
    getPeople(),
    getLeaveTypes(),
    getHolidays(range.from, range.to),
    supabase
      .from('attendance_leaves')
      .select('*')
      .in('status', ['approved', 'pending'])
      .lte('from_date', range.to)
      .gte('to_date', range.from)
      .order('from_date'),
  ])
  const deciders = [...new Set((leaves ?? []).map((l) => l.decided_by).filter((v): v is string => !!v))]
  const { data: names } = deciders.length
    ? await supabase.from('profiles').select('id, full_name').in('id', deciders)
    : { data: [] as { id: string; full_name: string }[] }
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.full_name]))
  const personOf = new Map(people.map((p) => [p.id, p]))
  const typeOf = new Map(leaveTypes.map((t) => [t.id, t]))
  const holidayMap = new Map(holidays.map((h) => [h.holiday_on, h.name]))

  return (leaves ?? []).map((l) => {
    const person = personOf.get(l.person_id)
    return {
      personName: person?.full_name ?? 'Someone',
      deviceCode: person?.device_code ?? '',
      typeCode: typeOf.get(l.leave_type_id)?.code ?? '?',
      typeName: typeOf.get(l.leave_type_id)?.name ?? 'Leave',
      from: l.from_date,
      to: l.to_date,
      halfDay: l.half_day,
      days: person ? leaveDays(l, person.shift, holidayMap) : 0,
      status: l.status === 'approved' ? 'Approved' : 'Waiting',
      reason: l.reason,
      decidedBy: l.decided_by ? nameOf.get(l.decided_by) ?? null : null,
    }
  })
}

/** The company's name as printed on documents. */
export async function companyName(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.from('company_settings').select('legal_name, trade_name').maybeSingle()
  return data?.trade_name || data?.legal_name || 'ANK Design & Automation Solutions LLP'
}
