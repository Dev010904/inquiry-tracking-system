'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FOLLOWUP_CHANNEL } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { markFollowupDone, snoozeFollowup } from '@/app/(app)/dashboard/actions'
import type { FollowupRow } from '@/types/database'

const SNOOZE = [
  { days: 1, label: '1d' },
  { days: 3, label: '3d' },
  { days: 7, label: '1w' },
] as const

/** A pending follow-up on the inquiry detail screen, with the same inline actions as the dashboard. */
export function FollowupItem({ followup }: { followup: FollowupRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  const effectiveDue = followup.snoozed_to ?? followup.due_at
  const overdue = new Date(effectiveDue) < new Date()

  function run(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    hide: boolean
  ) {
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        if (hide) setDone(true)
        toast.success(success)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (done) return null

  return (
    <li
      className={cn(
        'flex flex-col gap-3 border-l-4 p-3 sm:flex-row sm:items-start sm:justify-between',
        overdue ? 'border-l-overdue' : 'border-l-border',
        pending && 'opacity-60'
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{FOLLOWUP_CHANNEL[followup.channel]}</Badge>
          {followup.snoozed_to && <Badge variant="secondary">Snoozed</Badge>}
          {overdue && <Badge variant="overdue">Overdue</Badge>}
        </div>
        <p className="text-sm">{followup.note}</p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={effectiveDue} title={formatDateTime(effectiveDue)}>
            {formatRelative(effectiveDue)}
          </time>
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => markFollowupDone(followup.id), 'Marked done', true)}
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
          {SNOOZE.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              disabled={pending}
              aria-label={`Snooze ${label}`}
              onClick={() => run(() => snoozeFollowup(followup.id, days), `Snoozed ${label}`, false)}
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
