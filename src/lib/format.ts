import { addDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import { GST_RATE } from './constants'
import type { CurrencyCode } from '@/types/database'

/**
 * Locale per currency, because digit grouping belongs to the money and not to
 * the reader. INR groups in lakhs and crores (₹12,34,567); the rest group in
 * thousands, so formatting a dollar amount with en-IN would print
 * "$12,34,567.89" to an export customer.
 *
 * JPY and CNY use en-US for the glyph: ja-JP renders a fullwidth "￥" and zh-CN
 * renders CNY as a bare "¥", which is indistinguishable from yen on a document
 * that could carry either. en-US gives "¥" and "CN¥".
 *
 * No entry states a decimal count. Intl takes that from the currency itself,
 * which is what keeps JPY off the minor unit it does not have.
 */
const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'en-IE',
  JPY: 'en-US',
  CNY: 'en-US',
}

const wholeUnits = new Map<CurrencyCode, Intl.NumberFormat>()
const minorUnits = new Map<CurrencyCode, Intl.NumberFormat>()

function formatterFor(currency: CurrencyCode, exact: boolean): Intl.NumberFormat {
  const cache = exact ? minorUnits : wholeUnits
  let formatter = cache.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
      style: 'currency',
      currency,
      // Rounding to whole units is a display choice and safe for every
      // currency. Asking for two decimals would not be: it would print
      // "¥1,200.00" for a currency with no sen.
      ...(exact ? {} : { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    })
    cache.set(currency, formatter)
  }
  return formatter
}

/**
 * ₹12,34,567 · $1,234,567 · ¥1,200. Pass exact=true for the minor unit where
 * the currency has one.
 */
export function formatMoney(
  value: number | string | null | undefined,
  currency: CurrencyCode = 'INR',
  exact = false
): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return '—'
  return formatterFor(currency, exact).format(n)
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = typeof value === 'string' ? parseISO(value) : value
  return isValid(d) ? d : null
}

/** 03 Aug 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, 'dd MMM yyyy') : '—'
}

/**
 * The date a document stops being valid: the document date plus the number of
 * days agreed.
 *
 * Only the period is ever typed, because that is how validity is actually
 * negotiated — "hold this price for a fortnight", not "hold it until the 6th".
 * The customer reading the sheet wants the opposite: a deadline he can put in a
 * diary without counting. Deriving one from the other means nobody counts, and
 * the two can never disagree.
 *
 * The year is printed even though it is usually obvious. A 90-day quotation
 * raised in November expires in the next calendar year, and "12 Feb" on a sheet
 * dated November is a date a customer can read as already past.
 */
export function validTill(
  docDate: string | Date | null | undefined,
  days: number | null | undefined
): string {
  const d = toDate(docDate)
  if (!d || days === null || days === undefined || !Number.isFinite(days)) return '—'
  return format(addDays(d, days), 'dd MMM yyyy')
}

/** 03 Aug 2026, 4:30 pm — in the viewer's own timezone. Prefer the IST version. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, 'dd MMM yyyy, h:mm a') : '—'
}

/**
 * Timestamps are stored in UTC and must be read the same way by everyone.
 *
 * The device's timezone is not good enough for an audit trail: two people
 * looking at the same record would see different times, and a laptop with the
 * wrong clock setting would quietly lie. Everything time-stamped is therefore
 * rendered in Asia/Kolkata and labelled IST, regardless of where it is opened.
 */
const IST = 'Asia/Kolkata'

const istDateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** 03 Aug 2026, 12:25 pm IST */
export function formatDateTimeIST(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  // en-IN yields "03 Aug 2026, 12:25 pm"; the comma placement is already right.
  return `${istDateTime.format(d).replace(/ /g, ' ')} IST`
}

/**
 * Absolute time with the relative phrase beside it:
 * "03 Aug 2026, 12:25 pm IST (5 hours ago)".
 *
 * An audit needs the absolute time; a person skimming needs the relative one.
 * Showing only the relative phrase is what made the original timeline useless
 * for answering "when exactly did this happen".
 */
export function formatAudit(value: string | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  return `${formatDateTimeIST(d)} (${formatRelative(d)})`
}

/** "3 days ago" / "in 2 months" */
export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : '—'
}

/**
 * Client-side preview only. The stored values come from Postgres generated
 * columns — never write the output of this function back to the database.
 */
export function previewOrderTotals(orderValue: number, advanceReceived = 0) {
  const gstAmount = Math.round(orderValue * GST_RATE * 100) / 100
  const totalWithGst = orderValue + gstAmount
  return {
    orderValue,
    gstAmount,
    totalWithGst,
    advanceReceived,
    balancePending: totalWithGst - advanceReceived,
  }
}

/**
 * One address line, from parts that were typed by hand.
 *
 * Staff fill these fields in Settings and on the company record, and ending a
 * line with a comma is the natural way to write an address that continues on
 * the next one. Joining those parts with ", " then prints
 * "…Mari Mata No Khacho,, Marimata Lane" on a document that goes to a
 * customer. Rather than police what is typed, each part is stripped of
 * surrounding whitespace and commas before the join, and any doubled comma or
 * run of spaces still left inside a part is collapsed. A missing space after a
 * comma is closed up at the same time, since it comes from the same habit.
 *
 * Empty and null parts drop out, so a blank line two never leaves a dangling
 * separator behind it.
 */
export function joinAddress(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? '').replace(/^[\s,]+|[\s,]+$/g, ''))
    .filter(Boolean)
    .join(', ')
    // Comma runs first: a single-comma rule applied to "A,,B" would space it
    // out into "A, , B" rather than close it up.
    .replace(/\s*,(?:\s*,)+\s*/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
