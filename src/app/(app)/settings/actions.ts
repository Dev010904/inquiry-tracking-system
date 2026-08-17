'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { settingsManagerOrNull } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type SettingsResult = { ok: true } | { ok: false; error: string }

const idSchema = z.string().uuid('Unrecognised user')

/**
 * Every action here re-checks the flag. The page already gates the screen, but
 * a server action is a public endpoint — reachable by anyone who knows its id,
 * whether or not they could ever render the form that calls it.
 */
const NO_ACCESS = { ok: false, error: 'You cannot change settings.' } as const

/**
 * Changes a staff member's role.
 *
 * Enforced three deep: this check, the `profiles_update` RLS policy
 * (`is_admin() or id = auth.uid()`), and `guard_profile_privileges()` which
 * rejects a non-admin touching `role` even on their own row.
 */
export async function setUserRole(userId: string, role: 'admin' | 'staff'): Promise<SettingsResult> {
  const admin = await settingsManagerOrNull()
  if (!admin) return NO_ACCESS

  const parsed = idSchema.safeParse(userId)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }

  // Losing the last admin would lock everyone out of user management, and
  // only a direct database edit could undo it.
  if (userId === admin.id && role === 'staff') {
    return { ok: false, error: 'You cannot remove your own admin access.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ role }).eq('id', parsed.data)

  if (error) return { ok: false, error: 'Could not change the role.' }

  revalidatePath('/settings')
  return { ok: true }
}

/** Deactivating is the intended alternative to deleting — it preserves history. */
export async function setUserActive(userId: string, isActive: boolean): Promise<SettingsResult> {
  const admin = await settingsManagerOrNull()
  if (!admin) return NO_ACCESS

  const parsed = idSchema.safeParse(userId)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }

  if (userId === admin.id && !isActive) {
    return { ok: false, error: 'You cannot deactivate your own account.' }
  }

  const supabase = await createClient()

  if (!isActive) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)

    const { data: target } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', parsed.data)
      .maybeSingle()

    if (target?.role === 'admin' && (count ?? 0) <= 1) {
      return { ok: false, error: 'That is the last active admin. Promote someone else first.' }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: 'Could not update the account.' }

  revalidatePath('/settings')
  return { ok: true }
}

