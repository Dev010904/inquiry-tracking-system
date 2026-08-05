'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isActivePath } from './nav-items'

/**
 * Mobile tab bar. Five destinations only — more than that and the touch
 * targets drop below 44px on a 375px screen. Everything else lives behind
 * the "More" sheet in the header menu.
 */
export function BottomNav() {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => item.primary)

  return (
    <nav
      data-app-shell
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
    >
      {/* Column count follows the number of built destinations, so the bar
          stays evenly divided as phases land. */}
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, short, icon: Icon }) => {
          const active = isActivePath(pathname, href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    active ? 'bg-primary/10' : 'bg-transparent'
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {short}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
