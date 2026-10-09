import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Client for the attendance device's own calls, with no session at all.
 *
 * It uses the public key, and since 8_01 that key can run exactly two things:
 * `attendance_device_hello()` and `attendance_device_push()` (migration 9_01).
 * Both refuse a device an admin has not approved. Nothing else is reachable
 * through it — there is no service key in this app on purpose.
 */
export function createDeviceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  )
}
