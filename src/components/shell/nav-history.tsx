'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export const NAV_PREV_KEY = 'nav:prev'
export const NAV_CURRENT_KEY = 'nav:current'

/**
 * Remembers the screen you came from, so a Back link can go there.
 *
 * `document.referrer` cannot answer this. Next moves between pages on the
 * client, and a client-side navigation never updates the referrer — it still
 * names whatever loaded the tab, which after a while is nothing useful at all.
 * So the app has to record its own trail.
 *
 * One step is deliberately all that is kept. A full stack sounds better and
 * behaves worse: it has to be popped correctly on every route change including
 * the browser's own Back button, and when it drifts out of step the Back link
 * starts sending people somewhere they have never been. One previous entry is
 * always either right or absent, and absent falls back to a sensible default.
 *
 * sessionStorage rather than a context: it survives a reload, and it is scoped
 * to the tab, so two tabs open on different orders do not fight over it.
 */
export function NavHistory() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // The query string is part of where you were: coming back from a document
    // to "Documents" should land on the type you were looking at, not on the
    // picker.
    const query = searchParams?.toString()
    const url = query ? `${pathname}?${query}` : pathname

    try {
      const current = sessionStorage.getItem(NAV_CURRENT_KEY)
      // Guarded so a re-render on the same URL cannot overwrite the previous
      // entry with the current one, which would make Back a no-op.
      if (current && current !== url) sessionStorage.setItem(NAV_PREV_KEY, current)
      sessionStorage.setItem(NAV_CURRENT_KEY, url)
    } catch {
      // Private mode, or storage disabled. The Back links fall back to their
      // static destinations, which is exactly the old behaviour.
    }
  }, [pathname, searchParams])

  return null
}
