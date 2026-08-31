'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { FeatureKey } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isActivePath } from './nav-items'

export function Sidebar({
  canManageSettings,
  visibleFeatures,
}: {
  canManageSettings: boolean
  visibleFeatures: FeatureKey[]
}) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) =>
    item.feature ? visibleFeatures.includes(item.feature) : !item.settingsManagerOnly || canManageSettings
  )

  return (
    // Pinned to the viewport, like the header above the content. Without the
    // explicit height it stretches to the full document and there is nothing
    // for sticky to hold on to, so the menu scrolls away on a long page — the
    // nav below keeps its own overflow so a long menu still scrolls inside a
    // short window. self-start stops the flex row stretching it back.
    <aside
      data-app-shell
      className="hidden w-60 shrink-0 border-r bg-card md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:self-start"
    >
      <div className="flex h-16 items-center gap-2.5 border-b px-4">
        <Image
          src="/logo-mark.png"
          alt="ANK"
          width={640}
          height={423}
          priority
          className="h-auto w-16"
        />
        <span className="text-sm font-semibold leading-tight text-muted-foreground">
          Inquiry
          <br />
          Tracking
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // A left marker on the active item reads faster than colour
                // alone, and survives being viewed in bright sunlight on site.
                'relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-primary before:transition-transform',
                active
                  ? 'bg-primary/10 text-primary before:scale-y-100'
                  : 'text-muted-foreground before:scale-y-0 hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
