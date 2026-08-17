import { requireFeature } from '@/lib/permissions'

/**
 * Gate for every screen under /ip.
 *
 * A layout rather than a check in each page: this covers the nested routes
 * too, so a new page under here cannot be added without the guard.
 * `requireFeature` raises a plain 404 — someone whose role withholds this
 * should not learn from the app that the route exists.
 */
export default async function IpSectionLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('ip')
  return <>{children}</>
}
