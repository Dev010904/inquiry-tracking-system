'use client'

import { useEffect, useState } from 'react'
import { Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * One click to install the app, sitting permanently in Settings.
 *
 * This replaced a card that floated over the screen. Being fixed positioned it
 * printed, so "Install ANK Track" turned up at the foot of a saved invoice —
 * and an offer that follows you around the app is the wrong shape for
 * something you do once. Here it is somewhere you can go and find it, next to
 * the per-platform steps that were already on this screen.
 *
 * Chrome and Edge hand us `beforeinstallprompt`, which is the only way to open
 * the real install dialog. Where that never fires — Brave, Firefox, any
 * iPhone — the written steps below this button are the instructions, so the
 * button says so rather than pretending it can do something it cannot.
 */
export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS reports installed state on navigator, not through matchMedia.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) setInstalled(true)

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as InstallEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-ok" aria-hidden />
        You are using the installed app.
      </p>
    )
  }

  if (!deferred) {
    return (
      <p className="text-sm text-muted-foreground">
        This browser has no one-click install. Follow the steps for your device below.
      </p>
    )
  }

  return (
    <Button
      size="sm"
      onClick={async () => {
        await deferred.prompt()
        const { outcome } = await deferred.userChoice
        // The event is single-use: once shown it cannot be shown again, so drop
        // it either way and let `appinstalled` confirm a real install.
        setDeferred(null)
        if (outcome === 'accepted') setInstalled(true)
      }}
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      Install ANK Track
    </Button>
  )
}
