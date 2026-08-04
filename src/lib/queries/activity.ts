import 'server-only'

import { subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { ActivityFeedRow } from '@/types/database'
import type { ActivitySection } from '@/lib/activity'

export const ACTIVITY_PAGE_SIZE = 50

export { ACTIVITY_SECTIONS, activityHref, type ActivitySection } from '@/lib/activity'

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
