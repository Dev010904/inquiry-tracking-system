import type { Metadata } from 'next'
import { Info } from 'lucide-react'
import { ProfileForm } from '@/components/profile/profile-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'

export const metadata: Metadata = { title: 'Your profile · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const profile = await requireProfile()

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Your profile</h2>
        <p className="text-sm text-muted-foreground">
          Your own name and phone number, as they appear on the work you do.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={profile.full_name} phone={profile.phone} email={profile.email} />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Your role and whether your account is active are set by an administrator, not here.
      </p>
    </div>
  )
}
