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

/** 03 Aug 2026, 4:30 pm */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, 'dd MMM yyyy, h:mm a') : '—'
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
