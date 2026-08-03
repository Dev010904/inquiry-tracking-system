/**
 * Service worker for the ANK Inquiry Tracking app.
 *
 * SECURITY NOTE — read before changing anything here.
 *
 * This app is credential-gated and every page renders another company's
 * commercial data. A service worker that cached page HTML would keep that
 * data on the device after sign-out, and could serve one user's dashboard to
 * whoever opened the app next on a shared phone.
 *
 * So the rule is deliberately narrow:
 *   - Static, non-sensitive assets (icons, manifest)  -> cache first
 *   - Everything else, including all navigations,
 *     API calls and Supabase traffic                  -> network only
 *
 * The offline fallback is a static page that contains no business data.
 */

const VERSION = 'ank-v1'
const SHELL_CACHE = `${VERSION}-shell`

/** Only files that are identical for every user and contain no data. */
const SHELL_ASSETS = [
  '/offline',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individual failures must not abort the whole install.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

/** Assets safe to serve from cache: same-origin, static, user-independent. */
function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/icons/') ||
      url.pathname === '/manifest.json' ||
      url.pathname === '/favicon.ico')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
            return response
          })
      )
    )
    return
  }

  // Navigations: always go to the network so the user sees live data and a
  // valid session. Only when the network is unreachable do we show the
  // offline page — never a stale cached screen.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((page) => page ?? Response.error()))
    )
  }

  // Everything else (Next.js data, Supabase) falls through to the network
  // untouched. No caching of anything that could carry business data.
})
