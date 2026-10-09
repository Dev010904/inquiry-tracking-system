'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cancelRequest, decideCorrection, decideLeave, type AttendanceResult } from '@/lib/actions/attendance'
import { REQUEST_STATUS } from '@/lib/attendance/labels'
import { formatClock, formatDayShort, timeToMinutes } from '@/lib/attendance/time'
import type { CorrectionRequest, LeaveRequest } from '@/lib/queries/attendance'

const STATUS_VARIANT = {
  pending: 'duesoon',
  approved: 'ok',
  rejected: 'overdue',
  cancelled: 'muted',
} as const

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return {
    pending,
    run(fn: () => Promise<AttendanceResult>, success: string) {
      start(async () => {
        const result = await fn()
        if (result.ok) {
          toast.success(success)
          router.refresh()
        } else toast.error(result.error)
      })
    },
  }
}

function dates(from: string, to: string): string {
  return from === to ? `${formatDayShort(from)} ${from.slice(0, 4)}` : `${formatDayShort(from)} – ${formatDayShort(to)} ${to.slice(0, 4)}`
}

function Decision({ onDecide, pending }: { onDecide: (approve: boolean, note: string) => void; pending: boolean }) {
  const [note, setNote] = useState('')
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Input
        aria-label="Note for the decision (optional)"
        placeholder="Note for the decision (optional)"
        className="h-9 min-w-0 flex-1 sm:max-w-sm"
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" disabled={pending} onClick={() => onDecide(true, note)}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => onDecide(false, note)}>
        <X className="h-3.5 w-3.5" aria-hidden />
        Reject
      </Button>
    </div>
  )
}

/**
 * One request: the details with the status beside them, and whatever can be
 * done with it on its own line underneath, so a note box and two buttons never
 * squeeze the details into a narrow column.
 */
function RequestItem({ status, details, actions }: { status: keyof typeof STATUS_VARIANT; details: React.ReactNode; actions: React.ReactNode }) {
  return (
    <li className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">{details}</div>
        <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
          {REQUEST_STATUS[status]}
        </Badge>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </li>
  )
}

export function LeaveList({
  rows,
  isAdmin,
  myProfileId,
  showPerson,
}: {
  rows: LeaveRequest[]
  isAdmin: boolean
  myProfileId: string
  showPerson: boolean
}) {
  const { pending, run } = useRun()
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing here.</p>
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((l) => (
        <RequestItem
          key={l.id}
          status={l.status}
          details={
            <>
              <p className="font-medium">
                {showPerson && <span>{l.personName} · </span>}
                {l.typeCode} {l.half_day ? '(half day)' : `· ${l.days} day${l.days === 1 ? '' : 's'}`} · {dates(l.from_date, l.to_date)}
              </p>
              <p className="text-sm text-muted-foreground">{l.typeName}</p>
              {l.reason && <p className="text-sm">“{l.reason}”</p>}
              {l.status !== 'pending' && l.decidedByName && (
                <p className="text-xs text-muted-foreground">
                  {REQUEST_STATUS[l.status]} by {l.decidedByName}
                  {l.decision_note ? ` — ${l.decision_note}` : ''}
                </p>
              )}
            </>
          }
          actions={
            isAdmin && l.status === 'pending' ? (
              <Decision pending={pending} onDecide={(approve, note) => run(() => decideLeave(l.id, approve, note), approve ? 'Leave approved' : 'Leave rejected')} />
            ) : isAdmin && l.status === 'approved' ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (confirm('Cancel this approved leave? Those days go back to being counted from the punches.')) run(() => decideLeave(l.id, null), 'Leave cancelled')
                }}
              >
                Cancel leave
              </Button>
            ) : !isAdmin && l.status === 'pending' && l.requested_by === myProfileId ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelRequest('leave', l.id), 'Request withdrawn')}>
                Withdraw
              </Button>
            ) : null
          }
        />
      ))}
    </ul>
  )
}

export function CorrectionList({
  rows,
  isAdmin,
  myProfileId,
  showPerson,
}: {
  rows: CorrectionRequest[]
  isAdmin: boolean
  myProfileId: string
  showPerson: boolean
}) {
  const { pending, run } = useRun()
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing here.</p>
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((c) => (
        <RequestItem
          key={c.id}
          status={c.status}
          details={
            <>
              <p className="font-medium">
                {showPerson && <span>{c.personName} · </span>}
                {formatDayShort(c.work_date)} {c.work_date.slice(0, 4)}
                {c.punch_in && ` · in ${formatClock(timeToMinutes(c.punch_in))}`}
                {c.punch_out && ` · out ${formatClock(timeToMinutes(c.punch_out))}`}
              </p>
              <p className="text-sm">“{c.reason}”</p>
              {c.status !== 'pending' && c.decidedByName && (
                <p className="text-xs text-muted-foreground">
                  {REQUEST_STATUS[c.status]} by {c.decidedByName}
                  {c.decision_note ? ` — ${c.decision_note}` : ''}
                </p>
              )}
            </>
          }
          actions={
            isAdmin && c.status === 'pending' ? (
              <Decision
                pending={pending}
                onDecide={(approve, note) => run(() => decideCorrection(c.id, approve, note), approve ? 'Correction approved, punch added' : 'Correction rejected')}
              />
            ) : !isAdmin && c.status === 'pending' && c.requested_by === myProfileId ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelRequest('correction', c.id), 'Request withdrawn')}>
                Withdraw
              </Button>
            ) : null
          }
        />
      ))}
    </ul>
  )
}
