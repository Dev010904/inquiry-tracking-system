import type { Metadata } from 'next'
import { CorrectionRequestButton, LeaveRequestButton } from '@/components/attendance/request-forms'
import { CorrectionList, LeaveList } from '@/components/attendance/request-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { istToday } from '@/lib/attendance/time'
import { requireProfile } from '@/lib/auth'
import { getMyPerson, getRequests } from '@/lib/queries/attendance'

export const metadata: Metadata = { title: 'Leave and corrections · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

/**
 * Leave and punch corrections. Waiting requests come first; an admin decides
 * them here, and anyone can withdraw their own while it is still waiting.
 * Decided requests stay visible for 90 days.
 */
export default async function RequestsPage() {
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'
  const today = istToday()
  const [me, data] = await Promise.all([getMyPerson(), getRequests()])

  const people = data.people.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.full_name }))
  const leaveTypes = data.leaveTypes.filter((t) => t.is_active).map((t) => ({ id: t.id, code: t.code, name: t.name }))
  const waitingLeave = data.leaves.filter((l) => l.status === 'pending')
  const waitingCorrections = data.corrections.filter((c) => c.status === 'pending')
  const decidedLeave = data.leaves.filter((l) => l.status !== 'pending')
  const decidedCorrections = data.corrections.filter((c) => c.status !== 'pending')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leave &amp; corrections</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Requests waiting for you, and what was decided in the last 90 days.'
              : 'Your requests. An admin approves them.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LeaveRequestButton isAdmin={isAdmin} people={people} myPersonId={me?.id ?? null} leaveTypes={leaveTypes} defaultDate={today} triggerVariant="default" />
          <CorrectionRequestButton isAdmin={isAdmin} people={people} myPersonId={me?.id ?? null} defaultDate={today} today={today} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave waiting ({waitingLeave.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveList rows={waitingLeave} isAdmin={isAdmin} myProfileId={profile.id} showPerson={isAdmin} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corrections waiting ({waitingCorrections.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <CorrectionList rows={waitingCorrections} isAdmin={isAdmin} myProfileId={profile.id} showPerson={isAdmin} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave decided</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveList rows={decidedLeave} isAdmin={isAdmin} myProfileId={profile.id} showPerson={isAdmin} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corrections decided</CardTitle>
          </CardHeader>
          <CardContent>
            <CorrectionList rows={decidedCorrections} isAdmin={isAdmin} myProfileId={profile.id} showPerson={isAdmin} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
