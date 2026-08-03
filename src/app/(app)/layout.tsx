import Image from 'next/image'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { BottomNav } from '@/components/shell/bottom-nav'
import { PageTitle } from '@/components/shell/page-title'
import { Sidebar } from '@/components/shell/sidebar'
import { UserMenu } from '@/components/shell/user-menu'
import { initialsOf, requireProfile } from '@/lib/auth'

/**
 * Shell for every signed-in screen. Middleware guarantees a session; this
 * layout additionally guarantees an *active staff profile* before any child
 * page runs a query.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'

  return (
    <div className="flex min-h-dvh bg-muted/30">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6">
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
            isAdmin={isAdmin}
          />
        </header>

        {/* pb-20 clears the fixed mobile tab bar. */}
        <main className="flex-1 p-4 pb-20 sm:p-6 md:pb-6">{children}</main>
      </div>

      <BottomNav />
      <InstallPrompt />
    </div>
  )
}
