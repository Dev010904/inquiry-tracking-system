import Link from 'next/link'
import { CheckCircle2, ClipboardList, ListTodo, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FOLLOWUP_CHANNEL, TASK_STATUS } from '@/lib/constants'
import { formatDate, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PendingTask } from '@/lib/queries/tasks'
import type { MyFollowup } from '@/lib/queries/my-work'

type Props = {
  fullName: string
  tasks: PendingTask[]
  followups: MyFollowup[]
  /** Whether the person may open the inquiry a follow-up belongs to. */
  canOpenInquiries: boolean
}

/**
 * The dashboard for someone whose role withholds the commercial one.
 *
 * There is deliberately no money on this page, and no company-wide count of
 * anything. It is not the money dashboard with the figures hidden — the page
 * chooses which of the two to build on the server, and the queries behind the
 * figures are never run for this user, so nothing lands in the HTML to be
 * found by anyone reading the source.
 */
export function MyWorkDashboard({ fullName, tasks, followups, canOpenInquiries }: Props) {
  const firstName = fullName.split(/\s+/)[0] ?? fullName
  const overdueTasks = tasks.filter((task) => (task.daysOverdue ?? -1) > 0).length
  const now = new Date()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">My work</h2>
        <p className="text-sm text-muted-foreground">
          {firstName}, this is what is assigned to you and what you owe someone a call about.
        </p>
      </div>

      <Card className={cn(overdueTasks > 0 && 'ring-1 ring-overdue/30')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo
              className={cn('h-5 w-5', overdueTasks > 0 ? 'text-overdue' : 'text-muted-foreground')}
              aria-hidden
            />
            Assigned to me
            {overdueTasks > 0 && <Badge variant="overdue">{overdueTasks} overdue</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Nothing outstanding.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-md border">
              {tasks.map((task) => {
                const late = (task.daysOverdue ?? -1) > 0
                const dueToday = task.daysOverdue === 0
                const href = task.parent_type === 'order' ? '/orders' : '/rnd'

                return (
                  <li
                    key={task.id}
                    className={cn(
                      'border-l-4 bg-card p-3',
                      late ? 'border-l-overdue' : dueToday ? 'border-l-duesoon' : 'border-l-border'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`${href}/${task.parent_id}`}
                        className="font-medium hover:underline"
                      >
                        {task.title}
                      </Link>
                      {task.status !== 'open' && (
                        <Badge variant={task.status === 'blocked' ? 'overdue' : 'secondary'}>
                          {TASK_STATUS[task.status]}
                        </Badge>
                      )}
                    </div>
                    {task.detail && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{task.detail}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {task.due_date ? (
                        <span className={cn(late && 'font-medium text-overdue')}>
                          {late
                            ? `${task.daysOverdue} ${task.daysOverdue === 1 ? 'day' : 'days'} overdue`
                            : dueToday
                              ? 'Due today'
                              : `Due ${formatDate(task.due_date)}`}
                        </span>
                      ) : (
                        'No date set'
                      )}
                      {` · Open it to move it along`}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 text-muted-foreground" aria-hidden />
            My follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {followups.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Nothing outstanding.
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-md border">
              {followups.map((followup) => {
                const late = new Date(followup.effectiveDue) < now
                return (
                  <li
                    key={followup.id}
                    className={cn(
                      'border-l-4 bg-card p-3',
                      late ? 'border-l-overdue' : 'border-l-border'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{followup.companyName ?? 'Unknown company'}</span>
                      {followup.inquiryNo &&
                        (canOpenInquiries ? (
                          <Link
                            href={`/inquiries/${followup.inquiryId}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {followup.inquiryNo}
                          </Link>
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
                            {followup.inquiryNo}
                          </span>
                        ))}
                      <Badge variant="muted">
                        <Phone className="mr-1 h-3 w-3" aria-hidden />
                        {FOLLOWUP_CHANNEL[followup.channel]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm">{followup.note}</p>
                    <p className={cn('mt-0.5 text-xs', late ? 'font-medium text-overdue' : 'text-muted-foreground')}>
                      {formatRelative(followup.effectiveDue)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
