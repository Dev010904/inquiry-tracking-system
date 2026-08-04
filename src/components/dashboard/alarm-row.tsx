'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Clock, Loader2, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FOLLOWUP_CHANNEL } from '@/lib/constants'
import { formatDateTimeIST, formatRelative } from '@/lib/format'
import { markFollowupDone, snoozeFollowup } from '@/app/(app)/dashboard/actions'
import type { AlarmBucket, FollowupAlarm } from '@/lib/queries/dashboard'

const ACCENT: Record<AlarmBucket, string> = {
  overdue: 'border-l-overdue',
  today: 'border-l-duesoon',
  upcoming: 'border-l-border',
}

const SNOOZE_OPTIONS = [
  { days: 1, label: '1d' },
  { days: 3, label: '3d' },
  { days: 7, label: '1w' },
] as const

export function AlarmRow({ alarm }: { alarm: FollowupAlarm }) {
  const [pending, startTransition] = useTransition()
  // Hides the row the instant an action succeeds, so the list feels
  // responsive while the server revalidation is still in flight.
  const [resolved, setResolved] = useState(false)

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        setResolved(true)
        toast.success(success)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (resolved) return null

  return (
    <li
      className={cn(
        'flex flex-col gap-3 border-l-4 bg-card p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        ACCENT[alarm.bucket],
        pending && 'opacity-60'
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{alarm.companyName}</span>
          {alarm.inquiryNo && (
            <Link
              href={`/inquiries/${alarm.inquiryId}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {alarm.inquiryNo}
            </Link>
          )}
          <Badge variant="muted">{FOLLOWUP_CHANNEL[alarm.channel]}</Badge>
          {alarm.isSnoozed && <Badge variant="secondary">Snoozed</Badge>}
        </div>

        {alarm.contactName && (
          <p className="text-sm text-muted-foreground">
            {alarm.contactName}
            {alarm.contactPhone && (
              <>
                {' · '}
                <a
                  href={`tel:${alarm.contactPhone}`}
                  className="inline-flex items-center gap-1 text-foreground hover:underline"
                >
                  <Phone className="h-3 w-3" aria-hidden />
                  {alarm.contactPhone}
                </a>
              </>
            )}
          </p>
        )}

        <p className="text-sm">{alarm.note}</p>

        <p className="text-xs text-muted-foreground">
          <time dateTime={alarm.effectiveDue} title={formatDateTimeIST(alarm.effectiveDue)}>
            {formatRelative(alarm.effectiveDue)}
          </time>
          {alarm.ownerName && ` · ${alarm.ownerName}`}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => markFollowupDone(alarm.id), 'Follow-up marked done')}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          Done
        </Button>

        <div className="flex items-center gap-1 rounded-md border p-0.5">
          <Clock className="ml-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {SNOOZE_OPTIONS.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => snoozeFollowup(alarm.id, days), `Snoozed for ${label.replace('w', ' week')}`)
              }
              aria-label={`Snooze ${label}`}
              className="h-8 min-w-8 rounded px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
