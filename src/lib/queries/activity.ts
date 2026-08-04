import 'server-only'

import { subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { ActivityFeedRow } from '@/types/database'

export const ACTIVITY_PAGE_SIZE = 50

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
} as const

export type ActivitySection = keyof typeof ACTIVITY_SECTIONS

export type ActivityFilters = {
  actorId?: string
  section?: ActivitySection
  /** 1 = last 24 hours, 7, 30, or 0 for everything. */
  days?: number
  page?: number
}

export type ActivityResult = {
  rows: ActivityFeedRow[]
  total: number
  page: number
  pageCount: number
}

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
    default:
      // Payments, follow-ups and work updates live inside a parent screen and
      // have no page of their own, so they are shown without a link rather
      // than linking somewhere that will not scroll to them.
      return null
  }
}

/**
 * Reads the staff-safe `activity_feed` view, never `activity_log` itself.
 *
 * The view drops the diff and removes rows about restricted IP assets, so the
 * app does not have to reason about either — and cannot get it wrong.
 */
export async function listActivity(filters: ActivityFilters): Promise<ActivityResult> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)

  let query = supabase.from('activity_feed').select('*', { count: 'exact' })

  if (filters.actorId) query = query.eq('actor_id', filters.actorId)
  if (filters.section) query = query.eq('table_name', filters.section)
  if (filters.days && filters.days > 0) {
    query = query.gte('created_at', subDays(new Date(), filters.days).toISOString())
  }

  const from = (page - 1) * ACTIVITY_PAGE_SIZE
  const { data, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + ACTIVITY_PAGE_SIZE - 1)

  const total = count ?? 0
  return {
    rows: data ?? [],
    total,
    page,
    pageCount: Math.ceil(total / ACTIVITY_PAGE_SIZE),
  }
}

/** The handful of most recent changes, for the dashboard strip. */
export async function recentActivity(limit = 5): Promise<ActivityFeedRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('activity_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  return data ?? []
}

/** Everyone who has ever appeared in the feed, for the person filter. */
export async function activityActors() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')
  return data ?? []
}
