import { AlarmClock, CalendarCheck, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AlarmRow } from './alarm-row'
import type { Alarms, FollowupAlarm, IpAlarm } from '@/lib/queries/dashboard'

function Group({
  title,
  tone,
  items,
}: {
  title: string
  tone: 'overdue' | 'duesoon' | 'muted'
  items: FollowupAlarm[]
}) {
  if (items.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 px-1 pb-2">
        <h3
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            tone === 'overdue' && 'text-overdue',
            tone === 'duesoon' && 'text-duesoon',
            tone === 'muted' && 'text-muted-foreground'
          )}
        >
          {title}
        </h3>
        <Badge variant={tone}>{items.length}</Badge>
      </div>
      <ul className="divide-y overflow-hidden rounded-md border">
        {items.map((alarm) => (
          <AlarmRow key={alarm.id} alarm={alarm} />
        ))}
      </ul>
    </section>
  )
}

/** IP deadlines are read-only here — acting on them happens on the IP screen. */
function IpGroup({ items }: { items: IpAlarm[] }) {
  if (items.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 px-1 pb-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-overdue">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          IP deadlines
        </h3>
        <Badge variant="overdue">{items.length}</Badge>
      </div>
      <ul className="divide-y overflow-hidden rounded-md border">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-center justify-between gap-3 border-l-4 bg-card p-3',
              item.daysLeft <= 7 ? 'border-l-overdue' : item.daysLeft <= 30 ? 'border-l-duesoon' : 'border-l-border'
            )}
          >
            <div className="min-w-0">
              {/* Plain text until the IP screens exist — the deadline still
                  needs surfacing here, it just has nowhere to link to yet. */}
              <p className="truncate font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">
                {item.label} · {formatDate(item.effectiveDue)}
              </p>
            </div>
            <Badge variant={item.daysLeft <= 7 ? 'overdue' : item.daysLeft <= 30 ? 'duesoon' : 'muted'}>
              {item.daysLeft < 0
                ? `${Math.abs(item.daysLeft)}d late`
                : item.daysLeft === 0
                  ? 'Today'
                  : `${item.daysLeft}d left`}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The most important element on the dashboard: everything with a deadline,
 * grouped by urgency, with the actions that clear it inline. IP sits at the
 * top because a missed statutory date cannot be undone.
 */
export function AlarmPanel({ alarms }: { alarms: Alarms }) {
  const { overdue, today, upcoming } = alarms.followups
  const total = overdue.length + today.length + upcoming.length + alarms.ip.length

  return (
    <Card className={cn(overdue.length > 0 && 'ring-1 ring-overdue/30')}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlarmClock className={cn('h-5 w-5', overdue.length > 0 ? 'text-overdue' : 'text-muted-foreground')} aria-hidden />
          Follow-up alarms
        </CardTitle>
        {overdue.length > 0 && <Badge variant="overdue">{overdue.length} overdue</Badge>}
      </CardHeader>

      <CardContent className="space-y-5">
        {total === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-ok" aria-hidden />
            <p className="font-medium">Nothing due</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              No follow-ups or IP deadlines in the next 7 days. Add a follow-up from any inquiry to
              keep it on the radar.
            </p>
          </div>
        ) : (
          <>
            <IpGroup items={alarms.ip} />
            <Group title="Overdue" tone="overdue" items={overdue} />
            <Group title="Due today" tone="duesoon" items={today} />
            <Group title="Next 7 days" tone="muted" items={upcoming} />
          </>
        )}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
          Snoozing moves a follow-up forward from today, not from its original due date.
        </p>
      </CardContent>
    </Card>
  )
}
