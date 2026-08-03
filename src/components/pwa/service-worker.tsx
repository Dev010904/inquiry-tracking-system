'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker. Renders nothing.
 *
 * Registration is skipped in development, where an active worker intercepting
 * requests makes hot reload behave unpredictably.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration costs the install prompt and the offline
        // page, nothing more — the app itself works regardless.
      })
    }

    if (document.readyState === 'complete') register()
    else {
      window.addEventListener('load', register)
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
