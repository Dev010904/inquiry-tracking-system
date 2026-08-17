import 'server-only'

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { FEATURE_KEYS, type FeatureKey } from '@/lib/constants'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { ProfileRow } from '@/types/database'

export type FeatureGrant = { canView: boolean; canEdit: boolean }
export type FeatureMap = Record<FeatureKey, FeatureGrant>

function everything(): FeatureMap {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, { canView: true, canEdit: true }])
  ) as FeatureMap
}

function nothing(): FeatureMap {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, { canView: false, canEdit: false }])
  ) as FeatureMap
}

/**
 * What the signed-in user may see and edit.
 *
 * A NULL `role_id` means fall back to the old enum, and the enum's answer is
 * "everything": before custom roles existed, a staff account could reach every
 * screen in the menu and Settings was already held separately by
 * `can_manage_settings`. So an unroled user is unaffected by any of this, which
 * is what keeps the feature safe to deploy under a live system.
 *
 * Note this governs *feature visibility only*. Whether the user may delete a
 * record, or reassign someone else's work, still comes from `profiles.role`
 * and the RLS built on `is_admin()`. The two are deliberately separate.
 */
export const featureMapFor = cache(async (profile: ProfileRow): Promise<FeatureMap> => {
  if (!profile.role_id) return everything()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('role_features')
    .select('feature_key, can_view, can_edit')
    .eq('role_id', profile.role_id)

  // Failing closed matters more than failing gracefully: a transient read
  // error must not hand someone the screens their role withholds.
  if (error) return nothing()

  const map = nothing()
  for (const row of data ?? []) {
    const key = row.feature_key as FeatureKey
    if (key in map) map[key] = { canView: row.can_view, canEdit: row.can_edit }
  }
  return map
})

/** The signed-in profile together with what it may reach. */
export const currentAccess = cache(
  async (): Promise<{ profile: ProfileRow; features: FeatureMap }> => {
    const profile = await requireProfile()
    return { profile, features: await featureMapFor(profile) }
  }
)

/**
 * Gate for a page or route segment.
 *
 * A plain 404, not a "you do not have permission" page: someone who cannot
 * open Orders should not learn from the app that Orders is there. Same
 * reasoning as `settingsManagerOrNull()` on the Settings screen.
 */
export async function requireFeature(feature: FeatureKey): Promise<ProfileRow> {
  const { profile, features } = await currentAccess()
  if (!features[feature].canView) notFound()
  return profile
}

/**
 * Gate for a server action — the profile if it may edit this feature, else
 * null.
 *
 * Every action re-checks. A server action is a public endpoint reachable by
 * anyone who knows its id, whether or not they could ever render the form that
 * calls it, so hiding the menu item is not access control.
 */
export async function editorOrNull(feature: FeatureKey): Promise<ProfileRow | null> {
  const { profile, features } = await currentAccess()
  return features[feature].canEdit ? profile : null
}

/**
 * The profile if it may edit ANY of these features, else null.
 *
 * For work that shows up on more than one screen. A follow-up is the case
 * that needed it: it belongs to an inquiry, but it also appears as the user's
 * own work on the dashboard, and ticking off work assigned to you should not
 * require the whole Inquiries feature.
 */
export async function editorOfAny(features: FeatureKey[]): Promise<ProfileRow | null> {
  const { profile, features: map } = await currentAccess()
  return features.some((feature) => map[feature].canEdit) ? profile : null
}

/** What an action returns when the role withholds edit rights. */
export const NO_FEATURE_ACCESS = {
  ok: false as const,
  error: 'You do not have access to this.',
}
