import Link from 'next/link'
import { CalendarDays, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MEETING_TYPE } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import type { MeetingWithActions } from '@/lib/queries/quality'

type Props = {
  meetings: MeetingWithActions[]
  /** Where "Record minutes" goes, pre-linked to this order or client. */
  newHref: string
}

/** Recent minutes for whatever record this sits on. */
export function MeetingsPanel({ meetings, newHref }: Props) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          Meetings
        </CardTitle>
        <Link href={newHref} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          <Plus className="h-4 w-4" aria-hidden />
          Record minutes
        </Link>
      </CardHeader>

      <CardContent>
        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No minutes yet. Recording a site visit here means its action items land on the alarm
            panel rather than in someone&apos;s notebook.
          </p>
        ) : (
          <ul className="divide-y">
            {meetings.map((meeting) => {
              const open = meeting.actions.filter((a) => !a.is_done).length
              return (
                <li key={meeting.id}>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{meeting.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {MEETING_TYPE[meeting.meeting_type]} · {formatDate(meeting.meeting_date)}
                      </p>
                    </div>
                    {open > 0 && (
                      <Badge variant="duesoon">
                        {open} open
                      </Badge>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
