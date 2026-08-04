import type { Metadata } from 'next'
import { Info, Monitor, Smartphone, UserPlus } from 'lucide-react'
import { CompanySettingsForm } from '@/components/settings/company-settings-form'
import { ProfileForm } from '@/components/settings/profile-form'
import { UserTable } from '@/components/settings/user-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCompanySettings, missingSettings } from '@/lib/queries/documents'

export const metadata: Metadata = { title: 'Settings · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

const INSTALL_STEPS = [
  {
    icon: Smartphone,
    platform: 'Android — Chrome',
    steps: 'Tap the Install banner, or ⋮ menu → Install app.',
  },
  {
    icon: Smartphone,
    platform: 'iPhone / iPad — Safari only',
    steps: 'Share button → Add to Home Screen → Add. Chrome on iOS cannot install apps.',
  },
  {
    icon: Monitor,
    platform: 'Windows / Mac — Chrome or Edge',
    steps: 'Click the install icon in the address bar, or ⋮ menu → Install.',
  },
]

export default async function SettingsPage() {
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'

  const settings = isAdmin ? await getCompanySettings() : null

  const supabase = await createClient()
  const { data: users } = isAdmin
    ? await supabase
        .from('profiles')
        .select('*')
        .order('is_active', { ascending: false })
        .order('full_name')
    : { data: null }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Your details, and — for admins — who can sign in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            fullName={profile.full_name}
            phone={profile.phone}
            email={profile.email}
          />
        </CardContent>
      </Card>

      {isAdmin && <CompanySettingsForm settings={settings} missing={missingSettings(settings)} />}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff accounts</CardTitle>
            <p className="text-sm text-muted-foreground">
              {users?.length ?? 0} account{users?.length === 1 ? '' : 's'}. Deactivate rather than
              delete — it keeps their name on the work they did.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {users && users.length > 0 && (
              <UserTable users={users} currentUserId={profile.id} />
            )}

            <div className="rounded-md border border-dashed p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
                Adding a new person
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                New sign-ins are created in Supabase, not here — creating an account needs an
                admin key that deliberately does not live in this app.
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Supabase → Authentication → Users → Add user → Create new user</li>
                <li>Enter their email and a temporary password</li>
                <li>
                  Tick <strong className="font-medium text-foreground">Auto Confirm User</strong> —
                  without it they cannot sign in
                </li>
                <li>
                  Under User Metadata add{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {'{ "full_name": "Their Name" }'}
                  </code>
                </li>
              </ol>
              <p className="mt-2 text-sm text-muted-foreground">
                They appear in the list above straight away, as Staff. Password resets are done the
                same way: Authentication → Users → ⋮ → Reset password.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install the app</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adds an icon to the home screen and opens without browser bars.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {INSTALL_STEPS.map(({ icon: Icon, platform, steps }) => (
              <li key={platform} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-sm font-medium">{platform}</p>
                  <p className="text-sm text-muted-foreground">{steps}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About this system</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">GST rate</dt>
              <dd className="font-medium">18% — fixed, not configurable</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="font-medium">INR (₹)</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="font-medium">{isAdmin ? 'Admin' : 'Staff'}</dd>
            </div>
          </dl>

          <p className="mt-3 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            GST, order totals and balances are calculated by the database and cannot be edited from
            any screen. Only admins can delete records, and deletions are reversible.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
