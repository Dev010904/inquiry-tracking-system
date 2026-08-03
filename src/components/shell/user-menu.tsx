'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LogOut, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { signOut } from '@/app/login/actions'

type Props = {
  fullName: string
  email: string | null
  initials: string
  isAdmin: boolean
}

/**
 * Header avatar menu. On mobile it also carries the nav destinations that
 * did not fit in the five-slot bottom bar.
 */
export function UserMenu({ fullName, email, initials, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const overflowItems = NAV_ITEMS.filter(
    (item) => !item.primary && (!item.adminOnly || isAdmin)
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-11 items-center gap-2 rounded-full pl-1 pr-2 transition-colors hover:bg-accent"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials}
        </span>
        <Menu className="h-4 w-4 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-medium">{fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{email ?? '—'}</p>
            {isAdmin && (
              <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Admin
              </span>
            )}
          </div>

          {overflowItems.length > 0 && (
            <div className="border-t py-1 md:hidden">
              {overflowItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-accent"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
          )}

          <form action={signOut} className="border-t pt-1">
            <button
              type="submit"
              role="menuitem"
              className={cn(
                'flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-destructive',
                'hover:bg-destructive/10'
              )}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
