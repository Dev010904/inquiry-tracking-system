import { Suspense } from 'react'
import Image from 'next/image'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { NavHistory } from '@/components/shell/nav-history'
import { BottomNav } from '@/components/shell/bottom-nav'
import { PageTitle } from '@/components/shell/page-title'
import { Sidebar } from '@/components/shell/sidebar'
import { UserMenu } from '@/components/shell/user-menu'
import { initialsOf } from '@/lib/auth'
import { currentAccess, visibleFeatures } from '@/lib/permissions'
import { activeFy } from '@/lib/fy-server'

/**
 * Shell for every signed-in screen. Middleware guarantees a session; this
 * layout additionally guarantees an *active staff profile* before any child
 * page runs a query.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, features } = await currentAccess()
  const fy = await activeFy()

  // Hiding a menu item is not access control — each route segment gates
  // itself and each server action re-checks. This is only so the menu stops
  // advertising screens the user would be 404'd from.
  const visible = visibleFeatures(features)

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Records the screen you came from so Back links can return there.
          Renders nothing. In Suspense because it reads the query string, and
          useSearchParams opts its whole subtree out of static rendering —
          without the boundary that would drag the entire shell with it. */}
      <Suspense fallback={null}>
        <NavHistory />
      </Suspense>

      <Sidebar canManageSettings={profile.can_manage_settings} visibleFeatures={visible} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-app-shell
          className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-card/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/75 sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/logo-mark.png"
              alt="ANK"
              width={720}
              height={498}
              priority
              className="h-auto w-12 shrink-0 md:hidden"
            />
            <PageTitle />

            {/*
              Only ever shown while a closed year is selected.

              Someone reading last year's figures must not be able to forget it
              — every list on the screen is filtered, and a screen that looks
              normal but is missing this year's work is the one way this feature
              could cause a real mistake. In the current year it renders nothing
              at all, so the header is unchanged for staff.
            */}
            {fy.isPast && (
              <span
                className="shrink-0 rounded-full border border-duesoon/40 bg-duesoon/10 px-2.5 py-1 text-xs font-medium text-foreground"
                title={`Showing the closed financial year ${fy.fy}. New records are still filed in ${fy.current}.`}
              >
                FY {fy.fy}
              </span>
            )}
          </div>
          <UserMenu
            fullName={profile.full_name}
            email={profile.email}
            initials={initialsOf(profile.full_name)}
            isAdmin={profile.role === 'admin'}
            canManageSettings={profile.can_manage_settings}
            visibleFeatures={visible}
          />
        </header>

        {/* pb-24 clears the fixed mobile tab bar. */}
        <main data-app-shell className="flex-1 animate-fade-in p-4 pb-24 sm:p-6 md:pb-8">
          {children}
        </main>
      </div>

      <BottomNav visibleFeatures={visible} />
      <InstallPrompt />
    </div>
  )
}
