import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import { GST_RATE } from './constants'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** ₹1,23,456 — Indian digit grouping. Pass exact=true for paise. */
export function formatINR(value: number | string | null | undefined, exact = false): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return '—'
  return exact ? inrPaise.format(n) : inr.format(n)
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
