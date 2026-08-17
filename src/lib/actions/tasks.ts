'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import type { ParentKind } from '@/types/database'

export type TaskResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const parentKindSchema = z.enum(['order', 'rnd'])
const statusSchema = z.enum(['open', 'in_progress', 'blocked', 'done'])

const newTaskSchema = z.object({
  parent_type: parentKindSchema,
  parent_id: z.string().uuid(),
  title: z.string().trim().min(3, 'Say what needs doing').max(200, 'Keep the title short'),
  detail: z.string().trim().max(2000).optional().or(z.literal('')),
  due_date: z.string().optional().or(z.literal('')),
  assigned_to: z.string().uuid('Pick who this is for'),
})

/** The feature a task inherits from whatever it hangs off. */
function featureOf(parentType: ParentKind) {
  return parentType === 'order' ? ('orders' as const) : ('rnd' as const)
}

function pathsFor(parentType: ParentKind, parentId: string) {
  const base = parentType === 'order' ? '/orders' : '/rnd'
  return [`${base}/${parentId}`, base, '/dashboard']
}

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/**
 * Raises a piece of work against an order or an R&D project.
 *
 * Admin-only, and the database says so too: `tasks_insert` requires
 * `is_admin()`. That policy is also what stops a non-admin assigning work to
 * themselves — they cannot insert at all, so there is no self-assignment path
 * to close separately.
 */
export async function createTask(input: unknown): Promise<TaskResult> {
  const parsed = newTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data

  const profile = await editorOrNull(featureOf(values.parent_type))
  if (!profile) return NO_FEATURE_ACCESS
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can assign work.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').insert({
    parent_type: values.parent_type,
    parent_id: values.parent_id,
    title: values.title,
    detail: values.detail || null,
    due_date: values.due_date || null,
    assigned_to: values.assigned_to,
    assigned_by: profile.id,
    created_by: profile.id,
  })

  if (error) return { ok: false, error: 'Could not add the work.' }

  for (const path of pathsFor(values.parent_type, values.parent_id)) revalidatePath(path)
  return { ok: true }
}

/**
 * Moves a task along.
 *
 * No ownership check here on purpose. `guard_task_ownership()` decides whether
 * this caller is the assignee, and it is the only place that decision should
 * live — a second copy in TypeScript would be the one that goes stale.
 * `completed_at` is likewise absent: the trigger stamps and clears it.
 */
export async function setTaskStatus(
  taskId: string,
  status: string,
  parentType: ParentKind,
  parentId: string
): Promise<TaskResult> {
  const kind = parentKindSchema.safeParse(parentType)
  if (!kind.success) return { ok: false, error: 'Unrecognised work' }

  if (!(await editorOrNull(featureOf(kind.data)))) return NO_FEATURE_ACCESS

  if (!z.string().uuid().safeParse(taskId).success) return { ok: false, error: 'Unrecognised work' }

  const parsed = statusSchema.safeParse(status)
  if (!parsed.success) return { ok: false, error: 'Unrecognised status' }

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').update({ status: parsed.data }).eq('id', taskId)

  if (error) {
    return {
      ok: false,
      error: error.message.includes('assigned to')
        ? 'Only the person this work is assigned to can move it along.'
        : 'Could not update the work.',
    }
  }

  for (const path of pathsFor(kind.data, parentId)) revalidatePath(path)
  return { ok: true }
}

/** Notes on a task. Same ownership rule, enforced in the same one place. */
export async function setTaskDetail(
  taskId: string,
  detail: string,
  parentType: ParentKind,
  parentId: string
): Promise<TaskResult> {
  const kind = parentKindSchema.safeParse(parentType)
  if (!kind.success) return { ok: false, error: 'Unrecognised work' }

  if (!(await editorOrNull(featureOf(kind.data)))) return NO_FEATURE_ACCESS

  if (!z.string().uuid().safeParse(taskId).success) return { ok: false, error: 'Unrecognised work' }
  if (detail.length > 2000) return { ok: false, error: 'Keep the notes under 2000 characters.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ detail: detail.trim() || null })
    .eq('id', taskId)

  if (error) {
    return {
      ok: false,
      error: error.message.includes('assigned to')
        ? 'Only the person this work is assigned to can change its notes.'
        : 'Could not save the notes.',
    }
  }

  for (const path of pathsFor(kind.data, parentId)) revalidatePath(path)
  return { ok: true }
}

/**
 * Hands a task to someone else.
 *
 * The change lands in Recent changes as "reassigned from A to B" — see the
 * `tasks` branch of `log_activity()`, which resolves both uuids to names so
 * the feed reads as a sentence.
 */
export async function reassignTask(
  taskId: string,
  assignedTo: string,
  parentType: ParentKind,
  parentId: string
): Promise<TaskResult> {
  const kind = parentKindSchema.safeParse(parentType)
  if (!kind.success) return { ok: false, error: 'Unrecognised work' }

  const profile = await editorOrNull(featureOf(kind.data))
  if (!profile) return NO_FEATURE_ACCESS
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can reassign work.' }
  }

  if (!z.string().uuid().safeParse(taskId).success) return { ok: false, error: 'Unrecognised work' }
  if (!z.string().uuid().safeParse(assignedTo).success) {
    return { ok: false, error: 'Pick who this is for' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ assigned_to: assignedTo, assigned_by: profile.id })
    .eq('id', taskId)

  if (error) return { ok: false, error: 'Could not reassign the work.' }

  for (const path of pathsFor(kind.data, parentId)) revalidatePath(path)
  revalidatePath('/activity')
  return { ok: true }
}

export async function deleteTask(
  taskId: string,
  parentType: ParentKind,
  parentId: string
): Promise<TaskResult> {
  const kind = parentKindSchema.safeParse(parentType)
  if (!kind.success) return { ok: false, error: 'Unrecognised work' }

  const profile = await editorOrNull(featureOf(kind.data))
  if (!profile) return NO_FEATURE_ACCESS
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can remove work.' }
  }

  if (!z.string().uuid().safeParse(taskId).success) return { ok: false, error: 'Unrecognised work' }

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)

  if (error) return { ok: false, error: 'Could not remove the work.' }

  for (const path of pathsFor(kind.data, parentId)) revalidatePath(path)
  return { ok: true }
}
