/**
 * The Indian financial year: 1 April to 31 March.
 *
 * One label format is used everywhere — `2026-27` — and it is the same string
 * the database already prints on documents through `fy_label()` and keys its
 * counters by. Keeping the two identical is what lets a number on paper be
 * traced back to the year that produced it without any conversion.
 *
 * Everything here is pure and timezone-explicit. The boundary matters: at
 * 00:30 IST on 1 April the server is still on 31 March in UTC, and a naive
 * `new Date().getMonth()` would put the first records of the new year into
 * the old one. Every calculation below goes through the IST calendar date.
 */

const IST = 'Asia/Kolkata'

/** Today's date in India, as `YYYY-MM-DD`, wherever the server happens to run. */
export function istToday(now: Date = new Date()): string {
  // en-CA gives ISO-shaped output, which is what makes this a one-liner.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** The financial year a date falls in. `2026-08-19` and `2027-03-31` are both `2026-27`. */
export function fyOf(date: string | Date): string {
  const iso = typeof date === 'string' ? date.slice(0, 10) : istToday(date)
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** The financial year we are in now. */
export function currentFy(now: Date = new Date()): string {
  return fyOf(istToday(now))
}

/** The year a label starts in: `2026-27` gives 2026. */
export function fyStartYear(label: string): number {
  return Number(label.slice(0, 4))
}

/**
 * The inclusive date range of a financial year, as `YYYY-MM-DD`.
 *
 * Inclusive at both ends because every date column scoped by this is a `date`,
 * not a timestamp — so `lte` on 31 March is exactly right and there is no
 * midnight edge to get wrong.
 */
export function fyRange(label: string): { from: string; to: string } {
  const start = fyStartYear(label)
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` }
}

/** `2026-27` — already display-ready, but named so call sites read clearly. */
export function formatFy(label: string): string {
  return label
}

/** Whether a string is a financial-year label this app would ever produce. */
export function isFy(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false
  const start = Number(value.slice(0, 4))
  return value === `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/**
 * Every financial year from the earliest one holding data up to the current
 * one, newest first.
 *
 * Built from the data rather than from a fixed list, so the picker never
 * offers a year the business did not trade in — and never hides one it did.
 * The current year is always included even when it is still empty, because
 * that is the year staff are working in on 1 April.
 */
export function fyOptions(earliest: string | null, now: Date = new Date()): string[] {
  const current = currentFy(now)
  const first = earliest && isFy(earliest) ? fyStartYear(earliest) : fyStartYear(current)
  const last = fyStartYear(current)
  const out: string[] = []
  for (let y = Math.min(first, last); y <= last; y++) {
    out.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`)
  }
  return out.reverse()
}

/**
 * The same range as `fyRange`, but as instants for `timestamptz` columns.
 *
 * A financial year begins at midnight in India, which is 18:30 UTC the day
 * before. Comparing a `timestamptz` against the bare date `2026-04-01` would
 * therefore drop everything staff recorded during the first five and a half
 * hours of the year. The offset is written explicitly so that never happens.
 */
export function fyRangeInstants(label: string): { from: string; to: string } {
  const { from, to } = fyRange(label)
  return { from: `${from}T00:00:00+05:30`, to: `${to}T23:59:59.999+05:30` }
}
