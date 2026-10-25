import type { Metadata } from 'next'
import Link from 'next/link'
import { Info, Monitor, Smartphone, UserPlus } from 'lucide-react'
import { InstallButton } from '@/components/pwa/install-button'
import { CompanySettingsForm } from '@/components/settings/company-settings-form'
import { FinancialYearCard } from '@/components/settings/financial-year-card'
import { RoleManager } from '@/components/settings/role-manager'
import { UserTable } from '@/components/settings/user-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notFound } from 'next/navigation'
import { CURRENCY } from '@/lib/constants'
import { settingsManagerOrNull } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCompanySettings, missingSettings } from '@/lib/queries/documents'
import { fyOptions } from '@/lib/fy'
import { formatDate } from '@/lib/format'
import { APP_VERSION, APP_VERSION_DATE } from '@/lib/version'
import { activeFy, earliestFy } from '@/lib/fy-server'

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
  const profile = await settingsManagerOrNull()

  // A 404 rather than a "you do not have permission" page: someone who cannot
  // open Settings should not learn from the app that Settings is there.
  if (!profile) notFound()

  const supabase = await createClient()

  // None of these depends on another, so they go out together rather than one
  // round trip after the next.
  const [settings, fy, earliest, { data: users }, { data: roles }, { data: roleFeatures }] =
    await Promise.all([
      getCompanySettings(),
      activeFy(),
      earliestFy(),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_hidden', false)
        .order('is_active', { ascending: false })
        .order('full_name'),
      supabase
        .from('roles')
        .select('*')
        .order('is_system', { ascending: false })
        .order('name'),
      supabase.from('role_features').select('*'),
    ])

  // Counted here rather than in the component so a delete can tell the admin
  // how many people it is about to send back to the enum fallback.
  const holders: Record<string, number> = {}
  for (const user of users ?? []) {
    if (user.role_id) holders[user.role_id] = (holders[user.role_id] ?? 0) + 1
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Company details and staff accounts. Your own name and phone live on{' '}
          <Link href="/profile" className="font-medium text-primary hover:underline">
            your profile
          </Link>
          .
        </p>
      </div>

      <FinancialYearCard
        active={fy.fy}
        current={fy.current}
        options={fyOptions(earliest)}
      />

      <CompanySettingsForm settings={settings} missing={missingSettings(settings)} />

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
            <UserTable
              users={users}
              currentUserId={profile.id}
              roles={roles ?? []}
              canManageAccounts={profile.role === 'admin'}
            />
          )}

          <div className="rounded-md border border-dashed p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
              Adding a new person
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              New sign-ins are created in Supabase, not here — creating an account needs an admin
              key that deliberately does not live in this app.
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
              They appear in the list above straight away, as <strong className="font-medium text-foreground">Inactive</strong>{' '}
              — nobody gets in until an admin checks who it is, gives them a role if they should
              see less than everything, and presses Activate. Password resets are done the same
              way: Authentication → Users → ⋮ → Reset password.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            To track someone&rsquo;s attendance, add their account here first, then put it on attendance under{' '}
            <Link href="/attendance/setup" className="text-primary hover:underline">
              Attendance → Setup
            </Link>{' '}
            with the number they are enrolled under on the fingerprint device.
          </p>
        </CardContent>
      </Card>

      {/* Roles are an admin capability, not a settings-manager one: the RLS
          policies on `roles` and `role_features` require is_admin(), so a
          settings manager who is not an admin would get a form that fails at
          the database. */}
      {profile.role === 'admin' && (
        <RoleManager
          roles={roles ?? []}
          features={roleFeatures ?? []}
          ownRoleId={profile.role_id}
          holders={holders}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install the app</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adds an icon to the home screen and opens without browser bars.
          </p>
        </CardHeader>
        <CardContent>
          {/* One click where the browser allows it; the steps below cover the rest. */}
          <div className="mb-4">
            <InstallButton />
          </div>

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
              <dd className="font-medium">
                {settings?.default_gst_rate ?? 18}% default · per line above
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="font-medium">
                {CURRENCY[settings?.default_currency ?? 'INR']} default · tax documents in INR
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="font-medium">{profile.role === 'admin' ? 'Admin' : 'Staff'}</dd>
            </div>
          </dl>

          <p className="mt-3 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            GST, order totals and balances are calculated by the database and cannot be edited from
            any screen. Only admins can delete records, and deletions are reversible.
          </p>
        </CardContent>
      </Card>

      {/* Quietly at the foot, the way an application states its version. */}
      <p className="pb-2 text-center text-xs text-muted-foreground">
        ANK Inquiry Tracking &middot; Version {APP_VERSION} &middot; Updated{' '}
        {formatDate(APP_VERSION_DATE)}
      </p>
    </div>
  )
}
