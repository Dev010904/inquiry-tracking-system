/**
 * Client-safe activity helpers.
 *
 * Kept separate from `@/lib/queries/activity`, which is `server-only` because
 * it touches the database. Client Components need the section names and the
 * link rule, so those live here where both sides can import them.
 */
import type { ActivityFeedRow } from '@/types/database'

/** The sections a change can belong to, as staff would name them. */
export const ACTIVITY_SECTIONS = {
  inquiries: 'Inquiries',
  followups: 'Follow-ups',
  orders: 'Orders',
  payments: 'Payments',
  work_updates: 'Work updates',
  rnd_projects: 'R&D projects',
  rnd_expenses: 'R&D expenses',
  ip_assets: 'IP assets',
  ip_events: 'IP events',
  companies: 'Companies',
  contacts: 'Contacts',
  profiles: 'Staff accounts',
  attendance: 'Attendance',
} as const

export type ActivitySection = keyof typeof ACTIVITY_SECTIONS

/** Where a change can be opened, when the row still points somewhere useful. */
export function activityHref(row: ActivityFeedRow): string | null {
  if (!row.row_id) return null
  switch (row.table_name) {
    case 'inquiries':
      return `/inquiries/${row.row_id}`
    case 'orders':
      return `/orders/${row.row_id}`
    case 'rnd_projects':
      return `/rnd/${row.row_id}`
    case 'ip_assets':
      return `/ip/${row.row_id}`
    case 'companies':
      return `/companies/${row.row_id}`
    case 'attendance':
      // People, leave and corrections all live under one section; the
      // requests screen is where most of these changes are made.
      return '/attendance/requests'
    default:
      // Payments, follow-ups and work updates live inside a parent screen and
      // have no page of their own, so they are shown without a link rather
      // than linking somewhere that will not scroll to them.
      return null
  }
}
