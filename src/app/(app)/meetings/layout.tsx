import { requireFeature } from '@/lib/permissions'

/**
 * Gate for every screen under /meetings.
 *
 * A layout rather than a check in each page: this covers the nested routes
 * too, so a new page under here cannot be added without the guard.
 * `requireFeature` raises a plain 404 — someone whose role withholds this
 * should not learn from the app that the route exists.
 */
export default async function MeetingsSectionLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('meetings')
  return <>{children}</>
}
