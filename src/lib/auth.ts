import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ProfileRow } from '@/types/database'

/**
 * The signed-in staff member, or a redirect to /login.
 *
 * Middleware already blocks anonymous requests, but a valid auth session is
 * not the same thing as an active staff account: a user could be deactivated
 * mid-session, or exist in auth.users without a profiles row. Every page that
 * reads business data goes through here.
 *
 * Cached for the request. A single page reaches this from the layout, the
 * page, the financial-year helper and the settings check — and each call was
 * a round trip to Supabase Auth plus a profile read before anything else could
 * start. Once per request is enough: nothing in a request changes who is
 * asking.
 */
export const requireProfile = cache(async function requireProfile(): Promise<ProfileRow> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut()
    redirect('/login?error=inactive')
  }

  return profile
})

export async function requireAdmin(): Promise<ProfileRow> {
  const profile = await requireProfile()
  if (profile.role !== 'admin') redirect('/dashboard')
  return profile
}

/**
 * The signed-in profile if it may manage Settings, otherwise null.
 *
 * Returns rather than redirects so each caller can fail in the way its own
 * surface needs: the page raises a plain 404, and the server actions return an
 * error. Neither should hint that a restricted screen exists.
 */
export async function settingsManagerOrNull(): Promise<ProfileRow | null> {
  const profile = await requireProfile()
  return profile.can_manage_settings ? profile : null
}

/** Initials for the avatar chip: "Anand Kumar" -> "AK". */
export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}
