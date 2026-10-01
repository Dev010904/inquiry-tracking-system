import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { AUTH_COOKIE_OPTIONS } from '@/lib/supabase/cookies'

/**
 * Routes reachable without a session. Everything else requires login.
 *
 * `/offline` is the service worker's fallback page. It must be fetchable
 * without a session, because the device may be offline *and* signed out —
 * it deliberately contains no business data.
 */
const PUBLIC_PATHS = ['/login', '/auth', '/offline']

/**
 * The Content-Security-Policy for one response.
 *
 * Scripts run only if they carry this request's nonce, which Next.js stamps on
 * its own scripts when it finds the nonce in the request's CSP header;
 * 'strict-dynamic' then trusts the chunks those scripts load. An injected
 * <script> — or an inline handler smuggled into the page — has no nonce and
 * does not run. Nothing is fetched from any origin but this one and the
 * project's Supabase (signed QA photo links and the photo upload).
 *
 * Styles stay 'unsafe-inline': React writes style attributes, and a style
 * cannot run code.
 */
function contentSecurityPolicy(nonce: string): string {
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
  const dev = process.env.NODE_ENV !== 'production'

  return [
    "default-src 'self'",
    // Development only: React's dev build evaluates strings for its tooling.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

export async function updateSession(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(nonce)

  // Next.js reads the nonce from the request's own CSP header.
  request.headers.set('x-nonce', nonce)
  request.headers.set('Content-Security-Policy', csp)

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not remove: this refreshes the auth token on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', path)
    return withSessionCookies(NextResponse.redirect(url), supabaseResponse)
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return withSessionCookies(NextResponse.redirect(url), supabaseResponse)
  }

  supabaseResponse.headers.set('Content-Security-Policy', csp)
  return supabaseResponse
}

/**
 * A redirect is a new response, so it has to carry whatever the session
 * refresh above just wrote. Dropping it would leave the browser holding the
 * refresh token Supabase has already rotated, and the next request would
 * present a spent token — which Supabase treats as theft and answers by ending
 * the session.
 */
function withSessionCookies(redirect: NextResponse, from: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}
