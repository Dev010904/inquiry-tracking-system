import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { OPEN_TASK_STATUSES } from '@/lib/constants'
import type { ParentKind, TaskRow } from '@/types/database'

/** A task with the names filled in, ready to render. */
export type PendingTask = TaskRow & {
  assigneeName: string
  /** Whole days past due. Negative when still to come, null when no due date. */
  daysOverdue: number | null
}

/** Midnight today in the viewer's clock, so "overdue" means the day, not the instant. */
function daysOverdueOf(dueDate: string | null): number | null {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  return Math.round((today.getTime() - due.getTime()) / 86_400_000)
}

/**
 * Overdue first, then by due date, then undated last.
 *
 * Undated work sinks rather than sorting as either very old or very new —
 * "no date" is not a date, and putting it at the top would push genuinely late
 * work off the fold.
 */
function byUrgency(a: PendingTask, b: PendingTask): number {
  if (a.due_date && !b.due_date) return -1
  if (!a.due_date && b.due_date) return 1
  if (a.due_date && b.due_date && a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1
  }
  return a.created_at < b.created_at ? -1 : 1
}

async function decorate(rows: TaskRow[]): Promise<PendingTask[]> {
  if (rows.length === 0) return []

  const supabase = await createClient()
  const ids = [...new Set(rows.map((row) => row.assigned_to))]
  const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids)

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]))

  return rows
    .map((row) => ({
      ...row,
      assigneeName: names.get(row.assigned_to) ?? 'Unknown',
      daysOverdue: daysOverdueOf(row.due_date),
    }))
    .sort(byUrgency)
}

/**
 * Outstanding work on one order or one R&D project.
 *
 * Done tasks are excluded: the card answers "what is still to do", and what
 * was done is already the job of the work updates feed above it.
 */
export async function getPendingTasks(
  parentType: ParentKind,
  parentId: string
): Promise<PendingTask[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('parent_type', parentType)
    .eq('parent_id', parentId)
    .in('status', OPEN_TASK_STATUSES)

  return decorate(data ?? [])
}

/**
 * Everything outstanding that belongs to one person, for the My work dashboard.
 *
 * Work whose order or project has been deleted is dropped. Nothing cascades
 * from either parent to `tasks`, and the card on the parent page cannot show
 * it because that page is gone — so this is the one place it would surface,
 * as a job pointing at nothing, with no way to clear it.
 */
export async function getMyTasks(userId: string): Promise<PendingTask[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', userId)
    .in('status', OPEN_TASK_STATUSES)

  const rows = data ?? []
  if (rows.length === 0) return []

  const idsOf = (kind: ParentKind) =>
    [...new Set(rows.filter((row) => row.parent_type === kind).map((row) => row.parent_id))]

  const orderIds = idsOf('order')
  const projectIds = idsOf('rnd')

  const [ordersRes, projectsRes] = await Promise.all([
    orderIds.length
      ? supabase.from('orders').select('id').in('id', orderIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as { id: string }[] }),
    projectIds.length
      ? supabase.from('rnd_projects').select('id').in('id', projectIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ])

  const liveParents = new Set([
    ...(ordersRes.data ?? []).map((row) => row.id),
    ...(projectsRes.data ?? []).map((row) => row.id),
  ])

  return decorate(rows.filter((row) => liveParents.has(row.parent_id)))
}

/** Active staff, for the assignee picker. */
export async function getAssignableStaff(): Promise<{ id: string; full_name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')

  return data ?? []
}
