/**
 * Words and colours for attendance, shared by every screen and the Excel file.
 * Client-safe.
 */
import type { DayCode } from './compute'

/** Cell colours on the screen (Tailwind classes) for each day code. */
export const DAY_TONE: Record<Exclude<DayCode, ''>, string> = {
  P: 'bg-ok/12 text-ok',
  IN: 'bg-ok/12 text-ok',
  OD: 'bg-ok/12 text-ok',
  HD: 'bg-duesoon/15 text-foreground',
  MP: 'bg-duesoon/15 text-foreground',
  A: 'bg-overdue/12 text-overdue',
  L: 'bg-primary/10 text-primary',
  HL: 'bg-primary/10 text-primary',
  H: 'bg-muted text-muted-foreground',
  WO: 'bg-muted text-muted-foreground',
  NY: 'bg-card text-muted-foreground',
}

/** The same colours for Excel (fill, text). */
export const DAY_EXCEL: Record<Exclude<DayCode, ''>, { fill: string; text: string }> = {
  P: { fill: '#E3F4EA', text: '#1E7A46' },
  IN: { fill: '#E3F4EA', text: '#1E7A46' },
  OD: { fill: '#DCEFE4', text: '#1E7A46' },
  HD: { fill: '#FFF1CC', text: '#7A5A00' },
  MP: { fill: '#FFE6B3', text: '#7A5A00' },
  A: { fill: '#FBE1E1', text: '#B42318' },
  L: { fill: '#E2E8FB', text: '#2440A8' },
  HL: { fill: '#E2E8FB', text: '#2440A8' },
  H: { fill: '#EEEEEE', text: '#555555' },
  WO: { fill: '#F3F3F3', text: '#777777' },
  NY: { fill: '#FFFFFF', text: '#777777' },
}

/** The key printed under the register and in the Excel file. */
export const DAY_LEGEND: [string, string][] = [
  ['P', 'Present'],
  ['HD', 'Half day'],
  ['A', 'Absent'],
  ['MP', 'Missed punch (one punch only — to be corrected)'],
  ['OD', 'On duty (site or client visit)'],
  ['CL / SL / EL', 'Leave, by type; ½ = half-day leave'],
  ['LWP', 'Leave without pay'],
  ['H', 'Holiday'],
  ['WO', 'Weekly off'],
  ['IN', 'Today: in and working'],
  ['NY', 'Today: not in yet'],
]

export const OVERRIDE_STATUS = {
  present: 'Present',
  half_day: 'Half day',
  absent: 'Absent',
  on_duty: 'On duty',
  leave: 'Leave',
  holiday: 'Holiday',
  weekly_off: 'Weekly off',
} as const

export const REQUEST_STATUS = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Withdrawn',
} as const

export const PUNCH_SOURCE = {
  device: 'Device',
  import: 'Imported',
  manual: 'Added by admin',
  correction: 'Correction',
} as const

export const DEVICE_STATUS = {
  pending: 'Waiting for approval',
  active: 'Approved',
  blocked: 'Blocked',
} as const

export const WEEKDAY_OPTIONS: [number, string][] = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
]

/**
 * A device number as the database stores it: digits without leading zeros
 * ("0001" → "1"), letters in capitals. Mirrors attendance_norm_code().
 */
export function normCode(code: string): string {
  const c = code.trim()
  if (/^[0-9]+$/.test(c)) return c.replace(/^0+/, '') || '0'
  return c.toUpperCase()
}
