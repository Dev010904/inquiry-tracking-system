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
 *   - Static, non-sensitive assets (icons, manifest)  -> network first,
 *     falling back to the cache only when offline
 *   - Everything else, including all navigations,
 *     API calls and Supabase traffic                  -> network only
 *
 * The offline fallback is a static page that contains no business data.
 *
 * WHY NETWORK FIRST AND NOT CACHE FIRST.
 *
 * The icons and the manifest used to be served cache first, and the cache was
 * keyed on a VERSION string that nobody ever changed. Between them those two
 * facts meant a device kept the icons it saw on its very first visit, for
 * ever: the activate handler only deletes caches whose key does not start with
 * VERSION, so the shell cache was never dropped, and `cached ?? fetch(...)`
 * meant a cached icon was never re-fetched. Removing the app from the home
 * screen and adding it again did not help, because the reinstall read the
 * icons back out of that same cache. The launcher icon on a phone was months
 * out of date and there was no way, from the phone, to make it update.
 *
 * These files are a few kilobytes and the host already serves them with
 * `max-age=0, must-revalidate`, so going to the network first costs a
 * conditional request that almost always comes back 304. That is a fair price
 * for the guarantee that what the device shows is what is deployed. The cache
 * is still written on every success, so the app still has its icons and
 * manifest when the network is gone.
 *
 * Bump VERSION whenever a stale shell entry must be dropped outright.
 */

const VERSION = 'ank-v2'
const SHELL_CACHE = `${VERSION}-shell`

/**
 * Only files that are identical for every user and contain no data.
 *
 * The icon names carry a revision suffix. The name has to change when the
 * artwork changes: Android mints the home-screen icon into a WebAPK at install
 * time, and a new URL is what reliably tells it the icon is not the one it
 * already has. manifest.json must point at the same names.
 */
const SHELL_ASSETS = [
  '/offline',
  '/manifest.json',
  '/icons/icon-192.v2.png',
  '/icons/icon-512.v2.png',
  '/icons/icon-maskable-192.v2.png',
  '/icons/icon-maskable-512.v2.png',
  '/icons/apple-touch-icon.v2.png',
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
      fetch(request)
        .then((response) => {
          // Only a good response is worth keeping; a 404 must not become the
          // thing this device shows from now on.
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
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
