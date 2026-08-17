import { notFound } from 'next/navigation'
import { currentAccess, visibleFeatures } from '@/lib/permissions'

/**
 * Gate for every screen under /reports.
 *
 * Reports needs `dashboard` as well as its own key — see `visibleFeatures()`,
 * which is where that rule lives so the menu and this guard cannot disagree.
 * Someone who cannot see the money on the dashboard must not reach it here.
 *
 * A plain 404, so nothing advertises the route.
 */
export default async function ReportsSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { features } = await currentAccess()
  if (!visibleFeatures(features).includes('reports')) notFound()
  return <>{children}</>
}
