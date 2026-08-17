import Image from 'next/image'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { BottomNav } from '@/components/shell/bottom-nav'
import { PageTitle } from '@/components/shell/page-title'
import { Sidebar } from '@/components/shell/sidebar'
import { UserMenu } from '@/components/shell/user-menu'
import { initialsOf } from '@/lib/auth'
import { currentAccess, visibleFeatures } from '@/lib/permissions'

/**
 * Shell for every signed-in screen. Middleware guarantees a session; this
 * layout additionally guarantees an *active staff profile* before any child
 * page runs a query.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, features } = await currentAccess()

  // Hiding a menu item is not access control — each route segment gates
  // itself and each server action re-checks. This is only so the menu stops
  // advertising screens the user would be 404'd from.
  const visible = visibleFeatures(features)

  return (
    <div className="flex min-h-dvh bg-background">
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
              width={311}
              height={159}
              priority
              className="h-auto w-12 shrink-0 md:hidden"
            />
            <PageTitle />
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
        <main className="flex-1 animate-fade-in p-4 pb-24 sm:p-6 md:pb-8">{children}</main>
      </div>

      <BottomNav visibleFeatures={visible} />
      <InstallPrompt />
    </div>
  )
}
