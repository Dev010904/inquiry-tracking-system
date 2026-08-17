'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type ProfileResult = { ok: true } | { ok: false; error: string }

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z.union([z.string().trim().max(20), z.literal('')]).optional(),
})

/**
 * Own name and phone — never role, active flag or settings access.
 *
 * Deliberately gated on `requireProfile()` and not on `can_manage_settings`:
 * this is the one piece of Settings that belongs to everybody, and folding it
 * behind the settings flag left staff unable to correct their own name.
 *
 * The `eq('id', profile.id)` is what keeps it to the caller's own row. A user
 * id is never taken from the request, so there is nothing to tamper with, and
 * `guard_profile_privileges()` still stands behind it in Postgres.
 */
export async function updateOwnProfile(input: unknown): Promise<ProfileResult> {
  const profile = await requireProfile()

  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null })
    .eq('id', profile.id)

  if (error) return { ok: false, error: 'Could not save your details.' }

  revalidatePath('/profile')
  revalidatePath('/', 'layout')
  return { ok: true }
}
