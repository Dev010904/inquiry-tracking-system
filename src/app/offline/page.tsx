import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'

export const metadata: Metadata = { title: 'Offline · ANK Inquiry Tracking' }

/**
 * Shown by the service worker when a page is requested with no network.
 *
 * Contains no business data by design — it is cached on the device, so it
 * must be safe for anyone who picks up the phone to see.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-muted/40 p-6 text-center">
      <WifiOff className="h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold tracking-tight">You are offline</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        ANK Inquiry Tracking needs a connection to show live inquiries, orders and deadlines.
        Reconnect and try again.
      </p>
      <p className="text-xs text-muted-foreground">
        Nothing you had open has been lost — it will reload once you are back online.
      </p>
    </main>
  )
}
