'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { settingsManagerOrNull } from '@/lib/auth'
import { FEATURE_KEYS } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'
import { currentFy, isFy } from '@/lib/fy'
import { FY_COOKIE } from '@/lib/fy-server'
import type { ProfileRow } from '@/types/database'

export type SettingsResult = { ok: true } | { ok: false; error: string }

const idSchema = z.string().uuid('Unrecognised user')

/**
 * Every action here re-checks the flag. The page already gates the screen, but
 * a server action is a public endpoint — reachable by anyone who knows its id,
 * whether or not they could ever render the form that calls it.
 */
const NO_ACCESS = { ok: false, error: 'You cannot change settings.' } as const

const NOT_ACCOUNT_ADMIN = {
  ok: false,
  error: 'Only an admin who can manage settings may change staff accounts.',
} as const

/**
 * Changes a staff member's role.
 *
 * Enforced three deep: this check, the `profiles_update` RLS policy
 * (`is_admin() or id = auth.uid()`), and `guard_profile_privileges()` which
 * rejects a non-admin touching `role` even on their own row.
 */
export async function setUserRole(userId: string, role: 'admin' | 'staff'): Promise<SettingsResult> {
  // The profiles_update policy lets only an admin change someone else's row.
  // A settings manager who is not an admin used to get "updated" back while
  // the database quietly changed nothing.
  const admin = await roleAdminOrNull()
  if (!admin) return NOT_ACCOUNT_ADMIN

  const parsed = idSchema.safeParse(userId)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }
  if (role !== 'admin' && role !== 'staff') return { ok: false, error: 'Unrecognised account type.' }

  // Losing the last admin would lock everyone out of user management, and
  // only a direct database edit could undo it.
  if (userId === admin.id && role === 'staff') {
    return { ok: false, error: 'You cannot remove your own admin access.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', parsed.data)
    .select('id')

  if (error || !data?.length) return { ok: false, error: 'Could not change the role.' }

  revalidatePath('/settings')
  return { ok: true }
}

/** Deactivating is the intended alternative to deleting — it preserves history. */
export async function setUserActive(userId: string, isActive: boolean): Promise<SettingsResult> {
  const admin = await roleAdminOrNull()
  if (!admin) return NOT_ACCOUNT_ADMIN

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

  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', parsed.data)
    .select('id')

  if (error || !data?.length) return { ok: false, error: 'Could not update the account.' }

  revalidatePath('/settings')
  return { ok: true }
}


// ---------------------------------------------------------------------------
// Custom roles
// ---------------------------------------------------------------------------

/**
 * Role management needs BOTH rights, and neither is redundant.
 *
 * `can_manage_settings` is what puts the screen in front of someone;
 * `is_admin()` is what the RLS policies on `roles` and `role_features`
 * actually enforce. Checking only the first would produce a form that looks
 * usable and then fails at the database with a policy error.
 */
async function roleAdminOrNull(): Promise<ProfileRow | null> {
  const profile = await settingsManagerOrNull()
  return profile?.role === 'admin' ? profile : null
}

const NOT_ROLE_ADMIN = {
  ok: false,
  error: 'Only an admin who can manage settings may change roles.',
} as const

const roleNameSchema = z
  .string()
  .trim()
  .min(2, 'Give the role a name of at least two characters')
  .max(60, 'Keep the name under 60 characters')

const featureKeySchema = z.enum(FEATURE_KEYS)

export async function createRole(name: string, description: string): Promise<SettingsResult> {
  const admin = await roleAdminOrNull()
  if (!admin) return NOT_ROLE_ADMIN

  const parsed = roleNameSchema.safeParse(name)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }

  const supabase = await createClient()
  const { error } = await supabase.from('roles').insert({
    name: parsed.data,
    description: description.trim() || null,
    created_by: admin.id,
  })

  if (error) {
    // 23505 is the unique index on name. Anything else is a policy or
    // connection problem the user cannot act on.
    if (error.code === '23505') return { ok: false, error: 'A role with that name already exists.' }
    return { ok: false, error: 'Could not create the role.' }
  }

  revalidatePath('/settings')
  return { ok: true }
}

/** System roles refuse this at the database; the message just gets there first. */
export async function renameRole(
  roleId: string,
  name: string,
  description: string
): Promise<SettingsResult> {
  if (!(await roleAdminOrNull())) return NOT_ROLE_ADMIN

  const id = idSchema.safeParse(roleId)
  if (!id.success) return { ok: false, error: 'Unrecognised role' }

  const parsed = roleNameSchema.safeParse(name)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('roles')
    .update({ name: parsed.data, description: description.trim() || null })
    .eq('id', id.data)

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A role with that name already exists.' }
    return { ok: false, error: error.message.includes('system role')
      ? 'A built-in role cannot be renamed.'
      : 'Could not rename the role.' }
  }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Deleting a role does not orphan its holders: `profiles.role_id` is
 * ON DELETE SET NULL, so anyone holding it falls back to the admin/staff enum
 * — the behaviour that ran here before roles existed.
 */
export async function deleteRole(roleId: string): Promise<SettingsResult> {
  if (!(await roleAdminOrNull())) return NOT_ROLE_ADMIN

  const id = idSchema.safeParse(roleId)
  if (!id.success) return { ok: false, error: 'Unrecognised role' }

  const supabase = await createClient()
  const { error } = await supabase.from('roles').delete().eq('id', id.data)

  if (error) {
    return {
      ok: false,
      error: error.message.includes('system role')
        ? 'A built-in role cannot be deleted.'
        : 'Could not delete the role.',
    }
  }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Sets one feature on one role.
 *
 * `settings` is not in `FEATURE_KEYS` and the database refuses it besides, so
 * there is no path — through this action or a hand-made request — by which an
 * admin grants themselves Settings through a role.
 *
 * Edit implies view, matched to the `role_features_edit_implies_view` check
 * constraint. Clearing view therefore clears edit with it.
 */
export async function setRoleFeature(
  roleId: string,
  featureKey: string,
  canView: boolean,
  canEdit: boolean
): Promise<SettingsResult> {
  if (!(await roleAdminOrNull())) return NOT_ROLE_ADMIN

  const id = idSchema.safeParse(roleId)
  if (!id.success) return { ok: false, error: 'Unrecognised role' }

  const key = featureKeySchema.safeParse(featureKey)
  if (!key.success) return { ok: false, error: 'Unrecognised feature' }

  const view = canView || canEdit
  const edit = canEdit && view

  const supabase = await createClient()
  const { error } = await supabase
    .from('role_features')
    .upsert(
      { role_id: id.data, feature_key: key.data, can_view: view, can_edit: edit },
      { onConflict: 'role_id,feature_key' }
    )

  if (error) {
    return {
      ok: false,
      error: error.message.includes('role you hold')
        ? 'You cannot change the permissions of the role you hold.'
        : 'Could not save that permission.',
    }
  }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Assigns a role to a user, or clears it back to the enum fallback.
 *
 * Nobody may do this to themselves — enforced by `guard_profile_role_id()`,
 * which bites admins too. The check here is only so the failure reads as a
 * sentence rather than a database exception.
 */
export async function setUserRoleId(
  userId: string,
  roleId: string | null
): Promise<SettingsResult> {
  const admin = await roleAdminOrNull()
  if (!admin) return NOT_ROLE_ADMIN

  const id = idSchema.safeParse(userId)
  if (!id.success) return { ok: false, error: id.error.issues[0]!.message }

  if (id.data === admin.id) {
    return { ok: false, error: 'You cannot change your own role. Ask another admin.' }
  }

  if (roleId !== null && !z.string().uuid().safeParse(roleId).success) {
    return { ok: false, error: 'Unrecognised role' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ role_id: roleId })
    .eq('id', id.data)
    .select('id')

  if (error || !data?.length) return { ok: false, error: 'Could not change the role.' }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Switches which financial year the screens are showing.
 *
 * Stored in a cookie rather than on the profile, deliberately. Looking at last
 * year's books is a thing you do for a few minutes, not a property of who you
 * are — and one admin reading 2025-26 must not change what anybody else sees.
 * The cookie is a view preference and nothing more: `activeFy()` re-derives the
 * permission on every request, so a cookie that outlives the permission that
 * set it stops working the moment the permission goes.
 *
 * Passing the current year clears the cookie instead of pinning it, so an
 * account left on "current" rolls into the new year on 1 April by itself.
 */
export async function setActiveFinancialYear(fy: string): Promise<SettingsResult> {
  const manager = await settingsManagerOrNull()
  if (!manager) return NO_ACCESS

  const current = currentFy()
  if (!isFy(fy)) return { ok: false, error: 'That is not a financial year.' }
  if (fy > current) {
    return { ok: false, error: 'That financial year has not started yet.' }
  }

  const jar = await cookies()
  if (fy === current) {
    jar.delete(FY_COOKIE)
  } else {
    jar.set(FY_COOKIE, fy, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // A year's view survives a restart but not a month of forgetting.
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  // Everything is scoped by the year, so everything has to be re-read.
  revalidatePath('/', 'layout')
  return { ok: true }
}
