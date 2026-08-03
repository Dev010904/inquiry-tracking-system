import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
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
        {children}
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
