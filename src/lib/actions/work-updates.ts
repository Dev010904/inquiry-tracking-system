'use server'

import { revalidatePath } from 'next/cache'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { workUpdateSchema } from '@/lib/schemas/order'

export type WorkUpdateResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/**
 * Posts a dated progress note against an order or an R&D project.
 *
 * Lives here rather than under either feature because both own it equally.
 * When the update carries a progress %, `sync_parent_progress()` pushes that
 * figure onto the parent row, so the progress bar is never a second number
 * kept in sync by hand.
 */
export async function addWorkUpdate(input: unknown): Promise<WorkUpdateResult> {
  const parsed = workUpdateSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors }
  }

  const values = parsed.data

  // The permission follows the parent, so the check has to wait until the
  // input is parsed. Validation first is safe: it reads nothing and writes
  // nothing, and the reply to a malformed payload is the same either way.
  const profile = await editorOrNull(values.parent_type === 'order' ? 'orders' : 'rnd')
  if (!profile) return NO_FEATURE_ACCESS

  const supabase = await createClient()

  const { error } = await supabase.from('work_updates').insert({
    parent_type: values.parent_type,
    parent_id: values.parent_id,
    update_date: values.update_date,
    note: values.note,
    progress_pct: values.progress_pct ?? null,
    author_id: profile.id,
  })

  if (error) return { ok: false, error: 'Could not post the update.' }

  const base = values.parent_type === 'order' ? '/orders' : '/rnd'
  revalidatePath(`${base}/${values.parent_id}`)
  revalidatePath(base)
  return { ok: true }
}
