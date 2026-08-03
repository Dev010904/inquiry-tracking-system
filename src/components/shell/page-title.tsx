'use client'

import { usePathname } from 'next/navigation'
import { NAV_ITEMS, isActivePath } from './nav-items'

/** Section name in the header, derived from the route. */
export function PageTitle() {
  const pathname = usePathname()
  const match = NAV_ITEMS.find((item) => isActivePath(pathname, item.href))
  return <h1 className="truncate text-base font-semibold tracking-tight">{match?.label ?? 'ANK'}</h1>
}
