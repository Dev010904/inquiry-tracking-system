import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Runs on every request. Refreshes the session and bounces anonymous
 * visitors to /login — this is the outer gate on the whole application.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files, and the attendance
     * device's own paths (/iclock/…, /d/<token>/iclock/…). A device has no
     * session to refresh or redirect, and calls every 30 seconds; who may send
     * is decided by the database functions those routes call.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|iclock/|d/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
