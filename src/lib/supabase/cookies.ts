/**
 * How the Supabase session cookies are written, by the middleware and by
 * server code alike.
 *
 * `httpOnly` is the point. @supabase/ssr defaults to cookies JavaScript can
 * read, because a browser-side client normally needs the session. This app has
 * none: every query runs on the server, and QA photos go up through a signed
 * upload URL the server hands out. So the access and refresh tokens are kept
 * out of reach of any script on the page — if something ever did manage to
 * run script here, it still could not lift the session and replay it from
 * somewhere else.
 *
 * Both writers must pass the same options: one refresh written without the
 * flag would quietly turn the cookie back into one any script can read.
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}
