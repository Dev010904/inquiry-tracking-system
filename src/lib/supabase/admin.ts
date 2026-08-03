import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * ⚠️ SERVICE ROLE CLIENT — BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * The `import 'server-only'` above makes importing this file from a Client
 * Component a build-time error, so the key can never reach a browser bundle.
 *
 * Use only for genuine admin operations (creating staff accounts, deactivating
 * users). Every such call site must independently verify the caller is an
 * admin first — this client will happily do anything it is asked.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
