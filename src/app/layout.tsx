import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { AnkLogoSprite } from '@/components/brand/ank-logo'
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker'
import './globals.css'

export const metadata: Metadata = {
  title: 'ANK Inquiry Tracking',
  description: 'Internal inquiry, order and R&D tracking',
  manifest: '/manifest.json',
  applicationName: 'ANK Track',
  // Internal tool: keep it out of search results entirely.
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: 'ANK Track',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
}

/**
 * Run server code in Singapore, next to the Supabase database.
 *
 * Vercel otherwise defaults to Washington DC, which puts the Atlantic and the
 * Pacific between the app and its data: every query becomes India → USA →
 * Singapore and back, roughly 250ms each. Pages here make several queries in
 * sequence, so that compounds into a visible delay on every navigation.
 * Co-locating with the database cuts each round trip to a few milliseconds.
 */
export const preferredRegion = 'sin1'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#000080',
  // Lets the app fill the screen behind the notch when installed on iOS.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AnkLogoSprite />
        {children}
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
