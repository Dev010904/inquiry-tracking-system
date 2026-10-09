/**
 * Dates and times for attendance, always in India time.
 *
 * India has one time zone and no daylight saving, so IST is a fixed +05:30 and
 * converting by offset is exact. That matters here more than anywhere else in
 * the app: a punch at 00:20 IST is 18:50 UTC the day before, and a naive
 * `getDate()` on the server (which runs in UTC) would put it on the wrong day
 * and make someone absent who was not.
 *
 * Pure and safe for both server and browser.
 */

export const IST_OFFSET_MINUTES = 330

/** `YYYY-MM-DD` */
export type IsoDate = string
/** `YYYY-MM` */
export type IsoMonth = string

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The IST calendar date and the minute of that day for an instant. */
export function istParts(instant: string | Date): { date: IsoDate; minutes: number } {
  const ms = (typeof instant === 'string' ? Date.parse(instant) : instant.getTime()) + IST_OFFSET_MINUTES * MS_PER_MINUTE
  const d = new Date(ms)
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  }
}

/** The instant (UTC ISO string) of a minute of an IST day. */
export function istInstant(date: IsoDate, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!, 0, minutes) - IST_OFFSET_MINUTES * MS_PER_MINUTE).toISOString()
}

/** Today in India. */
export function istToday(now: Date = new Date()): IsoDate {
  return istParts(now).date
}

/** Minutes since midnight in India, now. */
export function istNowMinutes(now: Date = new Date()): number {
  return istParts(now).minutes
}

/** "09:30:00" or "09:30" → 570 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 570 → "09:30", for <input type="time"> and the database. */
export function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** 570 → "9:30 am" */
export function formatClock(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${suffix}`
}

/** 485 → "8h 05m"; 0 → "0h 00m" */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const sign = minutes < 0 ? '-' : ''
  const abs = Math.abs(Math.round(minutes))
  return `${sign}${Math.floor(abs / 60)}h ${pad(abs % 60)}m`
}

/** 485 → 8.08 (hours, two decimals), for Excel totals. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

function toUtcMs(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function fromUtcMs(ms: number): IsoDate {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY)
}

/** Days from a to b; positive when b is later. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY)
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = new Date(toUtcMs(date)).getUTCDay()
  return day === 0 ? 7 : day
}

export const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAY_LETTER = ['', 'M', 'T', 'W', 'T', 'F', 'S', 'S'] as const
export const WEEKDAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return fromUtcMs(toUtcMs(value)) === value
}

export function isIsoMonth(value: unknown): value is IsoMonth {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7)
}

/** "2026-10" → "October 2026" */
export function formatMonth(month: IsoMonth): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

/** "2026-10-09" → "9 Oct" */
export function formatDayShort(date: IsoDate): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]!.slice(0, 3)}`
}

/** "2026-10-09" → "Fri, 9 Oct 2026" */
export function formatDayLong(date: IsoDate): string {
  return `${WEEKDAY_SHORT[isoWeekday(date)]}, ${formatDayShort(date)} ${date.slice(0, 4)}`
}

export function shiftMonth(month: IsoMonth, by: number): IsoMonth {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + by
  const year = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${year}-${pad(mm + 1)}`
}

/** Every day of a month, and the instants that bound it in IST. */
export function monthRange(month: IsoMonth): {
  from: IsoDate
  to: IsoDate
  days: IsoDate[]
  startInstant: string
  endInstant: string
} {
  const from = `${month}-01`
  const next = `${shiftMonth(month, 1)}-01`
  const to = addDays(next, -1)
  const days: IsoDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return { from, to, days, startInstant: istInstant(from, 0), endInstant: istInstant(next, 0) }
}

/** The financial year (1 April – 31 March) a date falls in, as dates. */
export function fyBounds(date: IsoDate): { from: IsoDate; to: IsoDate; label: string } {
  const y = Number(date.slice(0, 4))
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `${start}-${pad((start + 1) % 100)}` }
}
