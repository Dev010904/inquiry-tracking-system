'use server'

import { revalidatePath } from 'next/cache'
import { addDays } from 'date-fns'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

export type ActionResult = { ok: true } | { ok: false; error: string }

const idSchema = z.string().uuid('Unrecognised follow-up')
const snoozeSchema = z.union([z.literal(1), z.literal(3), z.literal(7)])

/**
 * Marking done is an UPDATE; `done_at` is stamped by a database trigger, so
 * this action never writes a timestamp itself. RLS still applies — the query
 * runs as the signed-in user.
 */
export async function markFollowupDone(followupId: string, outcome?: string): Promise<ActionResult> {
  await requireProfile()

  const parsed = idSchema.safeParse(followupId)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('followups')
    .update({ is_done: true, outcome: outcome?.trim() || null })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: 'Could not mark this follow-up done. Try again.' }

  revalidatePath('/dashboard')
  revalidatePath('/inquiries')
  return { ok: true }
}

/**
 * Snooze pushes `snoozed_to` forward from *now*, not from the original due
 * date, so a follow-up that is already three days overdue and snoozed by one
 * day reappears tomorrow rather than staying overdue.
 */
export async function snoozeFollowup(followupId: string, days: number): Promise<ActionResult> {
  await requireProfile()

  const id = idSchema.safeParse(followupId)
  if (!id.success) return { ok: false, error: id.error.issues[0]!.message }

  const parsedDays = snoozeSchema.safeParse(days)
  if (!parsedDays.success) return { ok: false, error: 'Snooze by 1, 3 or 7 days only.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('followups')
    .update({ snoozed_to: addDays(new Date(), parsedDays.data).toISOString() })
    .eq('id', id.data)
    .eq('is_done', false)

  if (error) return { ok: false, error: 'Could not snooze this follow-up. Try again.' }

  revalidatePath('/dashboard')
  revalidatePath('/inquiries')
  return { ok: true }
}
