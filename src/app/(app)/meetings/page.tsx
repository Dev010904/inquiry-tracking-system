import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { MEETING_TYPE } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { listMeetings } from '@/lib/queries/quality'

export const metadata: Metadata = { title: 'Meetings · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function MeetingsPage() {
  const meetings = await listMeetings({})

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Meetings</h2>
          <p className="text-sm text-muted-foreground">
            Site visits, reviews and handovers, with what was decided and who owes what.
          </p>
        </div>
        <Link href="/meetings/new" className={buttonVariants({ size: 'sm' })}>
          <Plus className="h-4 w-4" aria-hidden />
          New minutes
        </Link>
      </div>

      <Card className="overflow-hidden">
        {meetings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No minutes yet"
            description="Record a site visit and its action items land on the alarm panel."
            actionLabel="New minutes"
            actionHref="/meetings/new"
          />
        ) : (
          <ul className="divide-y">
            {meetings.map((meeting) => {
              const open = meeting.actions.filter((a) => !a.is_done).length
              return (
                <li key={meeting.id}>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{meeting.subject}</span>
                        <Badge variant="muted">{MEETING_TYPE[meeting.meeting_type]}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDate(meeting.meeting_date)}
                        {meeting.companyName ? ` · ${meeting.companyName}` : ''}
                        {meeting.location ? ` · ${meeting.location}` : ''}
                      </p>
                    </div>
                    {open > 0 && (
                      <Badge variant="duesoon">
                        {open} action{open === 1 ? '' : 's'} open
                      </Badge>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
