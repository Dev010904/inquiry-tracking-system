'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * The sections of Attendance. Setup is an admin's; the Requests count is what
 * is waiting for a decision, so an admin sees it without opening the tab.
 */
export function AttendanceTabs({ isAdmin, pending }: { isAdmin: boolean; pending: number }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/attendance', label: 'Today', exact: true },
    { href: '/attendance/register', label: 'Register' },
    { href: '/attendance/requests', label: 'Leave & corrections', badge: isAdmin && pending > 0 ? pending : 0 },
    ...(isAdmin ? [{ href: '/attendance/setup', label: 'Setup' }] : []),
  ]

  return (
    // The line under the tabs is an inset shadow, not a border: a scrolling row
    // clips anything hanging over its border, which left a 1px vertical scroll.
    <nav aria-label="Attendance" className="-mx-1 flex gap-1 overflow-x-auto px-1 shadow-[inset_0_-1px_0_hsl(var(--border))]">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`) ||
            (tab.href === '/attendance/register' && pathname.startsWith('/attendance/people'))
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {!!tab.badge && (
              <span className="rounded-full bg-duesoon/20 px-1.5 py-0.5 text-xs tnum text-foreground">
                {tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
