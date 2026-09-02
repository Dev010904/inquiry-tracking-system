'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { AnkLogo } from '@/components/brand/ank-logo'
import { Button } from '@/components/ui/button'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'ank-install-dismissed'

/**
 * Offers to install the app to the home screen.
 *
 * Chrome and Edge fire `beforeinstallprompt`, which gives us a real install
 * button. iOS Safari has no such event and never will, so there we show the
 * manual Share → Add to Home Screen instructions instead — otherwise iPhone
 * users get no prompt at all and assume there is no app.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    // sessionStorage keeps a dismissal for this visit only, so the offer
    // returns next time rather than being lost forever.
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS reports installed state on navigator, not via matchMedia.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (standalone) {
      setDismissed(true)
      return
    }

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    const isSafari =
      /safari/i.test(window.navigator.userAgent) && !/crios|fxios|chrome/i.test(window.navigator.userAgent)
    if (isIos && isSafari) setShowIosHint(true)

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as InstallEvent)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function close() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  // Shown whenever the app is not already installed. It used to require
  // either Chrome's beforeinstallprompt or iOS Safari, which meant it never
  // appeared at all in browsers that fire neither — Brave among them — so the
  // offer was invisible on the desktop it was written for.
  if (dismissed) return null

  return (
    // print:hidden as well as living only on the dashboard. It is fixed
    // positioned, so if it ever renders on a printable screen again it lands
    // in the output — which is how it reached the foot of a printed invoice.
    <div className="fixed inset-x-3 bottom-20 z-40 rounded-lg border bg-card p-3 shadow-lg print:hidden sm:left-auto sm:right-4 sm:w-80 md:bottom-4">
      <div className="flex items-start gap-3">
        <AnkLogo className="w-12 shrink-0" label="ANK" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install ANK Track</p>
          {deferred ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add it to your home screen and open it like any other app.
            </p>
          ) : showIosHint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap{' '}
              <Share className="inline h-3 w-3 align-text-bottom" aria-label="Share" /> then{' '}
              <strong className="font-medium">Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Open the browser menu and choose{' '}
              <strong className="font-medium">Install ANK Track</strong>.
            </p>
          )}

          {deferred && (
            <Button
              size="sm"
              className="mt-2"
              onClick={async () => {
                await deferred.prompt()
                await deferred.userChoice
                setDeferred(null)
                close()
              }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Install
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="-m-1 rounded p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
