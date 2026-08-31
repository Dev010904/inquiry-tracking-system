import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/shell/back-link'
import { Printer } from 'lucide-react'
import { MeetingActions } from '@/components/quality/meeting-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MEETING_TYPE } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getMeeting } from '@/lib/queries/quality'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const meeting = await getMeeting(id)
  return { title: `${meeting?.subject ?? 'Minutes'} · ANK Inquiry Tracking` }
}

/** A section only renders when it has something in it. */
function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="mt-1 whitespace-pre-wrap text-sm">{body}</p>
    </div>
  )
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [, meeting] = await Promise.all([requireProfile(), getMeeting(id)])
  if (!meeting) notFound()

  const supabase = await createClient()
  const { data: people } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="print:hidden">
        <BackLink fallbackHref="/meetings" fallbackLabel="Back to meetings" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{meeting.subject}</h2>
            <Badge variant="muted">{MEETING_TYPE[meeting.meeting_type]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(meeting.meeting_date)}
            {meeting.companyName ? ` · ${meeting.companyName}` : ''}
            {meeting.location ? ` · ${meeting.location}` : ''}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Minutes</CardTitle>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground print:hidden"
            aria-hidden
          >
            <Printer className="h-4 w-4" />
            Use your browser&apos;s print to save as PDF
          </a>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                ANK
              </h3>
              <ul className="mt-1 text-sm">
                {meeting.internal_attendees.length === 0 ? (
                  <li className="text-muted-foreground">Not recorded</li>
                ) : (
                  meeting.internal_attendees.map((name) => <li key={name}>{name}</li>)
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Client
              </h3>
              <ul className="mt-1 text-sm">
                {meeting.client_attendees.length === 0 ? (
                  <li className="text-muted-foreground">Not recorded</li>
                ) : (
                  meeting.client_attendees.map((name) => <li key={name}>{name}</li>)
                )}
              </ul>
            </div>
          </div>

          <Section title="Agenda" body={meeting.agenda} />
          <Section title="Discussion" body={meeting.discussion} />
          <Section title="Decisions" body={meeting.decisions} />
          <Section title="Next steps" body={meeting.next_steps} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <MeetingActions
            meetingId={meeting.id}
            actions={meeting.actions}
            people={people ?? []}
            canAlarm={Boolean(meeting.inquiry_id || meeting.order_id)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
