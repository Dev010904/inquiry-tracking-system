'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarClock, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatINR } from '@/lib/format'
import { addIpEvent } from '@/app/(app)/ip/actions'
import type { IpEventRow } from '@/types/database'

type Entry = IpEventRow & { authorName: string | null }

/** Common filings, offered as quick picks so wording stays consistent. */
const COMMON_EVENTS = [
  'Application filed',
  'Examination request',
  'Office action received',
  'Office action reply',
  'Publication',
  'Grant',
  'Renewal paid',
  'Attorney fee',
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function IpEvents({ assetId, events }: { assetId: string; events: Entry[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const [eventDate, setEventDate] = useState(today())
  const [eventType, setEventType] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')

  const totalCost = events.reduce((sum, e) => sum + Number(e.cost ?? 0), 0)

  function submit() {
    setErrors({})
    setFormError(undefined)

    startTransition(async () => {
      const result = await addIpEvent({
        ip_asset_id: assetId,
        event_date: eventDate,
        event_type: eventType,
        due_date: dueDate,
        cost,
        note: note || undefined,
      })

      if (result.ok) {
        toast.success('Event recorded')
        setOpen(false)
        setEventType('')
        setDueDate('')
        setCost('')
        setNote('')
        setEventDate(today())
        router.refresh()
      } else {
        setFormError(result.error)
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Events</CardTitle>
          <p className="text-sm text-muted-foreground">
            {events.length} recorded · {formatINR(totalCost)} in costs
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add event
        </Button>
      </CardHeader>

      <CardContent>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarClock className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No events yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Record filings, office actions and renewals. Any cost is added to the asset total,
              and a due date raises an alarm on the dashboard.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-4 border-l pl-6">
            {events.map((event) => {
              const overdue =
                event.due_date && new Date(event.due_date) < new Date(today())
              return (
                <li key={event.id} className="relative">
                  <span
                    className={`absolute -left-[1.72rem] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card ${
                      overdue ? 'bg-overdue' : 'bg-primary'
                    }`}
                  />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium">{event.event_type}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(event.event_date)}
                    </span>
                    {event.cost != null && Number(event.cost) > 0 && (
                      <Badge variant="muted">{formatINR(event.cost)}</Badge>
                    )}
                    {event.due_date && (
                      <Badge variant={overdue ? 'overdue' : 'duesoon'}>
                        Due {formatDate(event.due_date)}
                      </Badge>
                    )}
                  </div>
                  {event.note && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {event.note}
                    </p>
                  )}
                  {event.authorName && (
                    <p className="text-xs text-muted-foreground">{event.authorName}</p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Record an IP event"
        description="Costs roll into the asset total. A due date raises a dashboard alarm."
      >
        <div className="space-y-4">
          {formError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {formError}
            </p>
          )}

          <Field label="What happened" htmlFor="event_type" required error={errors.event_type}>
            <Input
              id="event_type"
              value={eventType}
              autoFocus
              onChange={(e) => setEventType(e.target.value)}
              placeholder="Office action received"
            />
          </Field>

          <div className="flex flex-wrap gap-1.5">
            {COMMON_EVENTS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setEventType(label)}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="event_date" required error={errors.event_date}>
              <Input
                id="event_date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </Field>
            <Field
              label="Response due"
              htmlFor="due_date"
              error={errors.due_date}
              hint="Optional"
            >
              <Input
                id="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
            <Field label="Cost" htmlFor="cost" error={errors.cost}>
              <Input
                id="cost"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Note" htmlFor="event_note">
            <Textarea
              id="event_note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || eventType.trim().length < 2}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Record event
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
