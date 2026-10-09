'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { applyLeave, requestCorrection, type AttendanceResult } from '@/lib/actions/attendance'

export type PersonOption = { id: string; name: string }
export type LeaveTypeOption = { id: string; code: string; name: string }

type Common = {
  /** Admins pick whose request it is and may approve it at once. */
  isAdmin: boolean
  people: PersonOption[]
  /** The viewer's own place on attendance, if they have one. */
  myPersonId: string | null
  defaultPersonId?: string
  triggerVariant?: 'default' | 'outline'
  triggerLabel?: string
  className?: string
}

function useSubmit(onDone: () => void) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  function submit(fn: () => Promise<AttendanceResult>, fallback: string) {
    start(async () => {
      const result = await fn()
      if (result.ok) {
        toast.success(result.message ?? fallback)
        setErrors({})
        onDone()
        router.refresh()
      } else {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }
  return { pending, errors, submit }
}

function PersonPicker({ people, value, onChange, error }: { people: PersonOption[]; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="For" htmlFor="req-person" error={error} required>
      <Select id="req-person" value={value} onChange={(e) => onChange(e.target.value)}>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export function LeaveRequestButton({
  leaveTypes,
  defaultDate,
  ...common
}: Common & { leaveTypes: LeaveTypeOption[]; defaultDate: string }) {
  const [open, setOpen] = useState(false)
  const initialPerson = common.defaultPersonId ?? common.myPersonId ?? common.people[0]?.id ?? ''
  const blank = { person_id: initialPerson, leave_type_id: leaveTypes[0]?.id ?? '', from_date: defaultDate, to_date: defaultDate, half_day: false, reason: '', approve_now: false }
  const [form, setForm] = useState(blank)
  const { pending, errors, submit } = useSubmit(() => {
    setOpen(false)
    setForm(blank)
  })
  const canPickPerson = common.isAdmin && common.people.length > 0
  if (!common.myPersonId && !canPickPerson) return null

  const forSomeoneElse = canPickPerson && form.person_id !== common.myPersonId

  return (
    <>
      <Button variant={common.triggerVariant ?? 'outline'} className={common.className} onClick={() => setOpen(true)}>
        <CalendarPlus className="h-4 w-4" aria-hidden />
        {common.triggerLabel ?? 'Apply for leave'}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for leave"
        description={forSomeoneElse ? 'Entered by you on their behalf.' : 'It goes to an admin for approval.'}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit(() => applyLeave({ ...form, person_id: canPickPerson ? form.person_id : '' }), 'Leave request sent')
          }}
        >
          {canPickPerson && (
            <PersonPicker people={common.people} value={form.person_id} onChange={(v) => setForm({ ...form, person_id: v })} error={errors.person_id} />
          )}
          <Field label="Type of leave" htmlFor="leave-type" error={errors.leave_type_id} required>
            <Select id="leave-type" value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" htmlFor="leave-from" error={errors.from_date} required>
              <Input
                id="leave-from"
                type="date"
                value={form.from_date}
                onChange={(e) => {
                  const from = e.target.value
                  setForm({ ...form, from_date: from, to_date: form.to_date < from ? from : form.to_date })
                }}
              />
            </Field>
            <Field label="To" htmlFor="leave-to" error={errors.to_date} required>
              <Input
                id="leave-to"
                type="date"
                min={form.from_date}
                value={form.to_date}
                disabled={form.half_day}
                onChange={(e) => setForm({ ...form, to_date: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.half_day}
              onChange={(e) => setForm({ ...form, half_day: e.target.checked, to_date: e.target.checked ? form.from_date : form.to_date })}
            />
            Half day only
          </label>
          <Field label="Reason" htmlFor="leave-reason" hint="Optional. Only admins see it." error={errors.reason}>
            <Textarea id="leave-reason" rows={2} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          {common.isAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.approve_now} onChange={(e) => setForm({ ...form, approve_now: e.target.checked })} />
              Approve it now
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {form.approve_now ? 'Add leave' : 'Send request'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export function CorrectionRequestButton({ defaultDate, today, ...common }: Common & { defaultDate: string; today: string }) {
  const [open, setOpen] = useState(false)
  const initialPerson = common.defaultPersonId ?? common.myPersonId ?? common.people[0]?.id ?? ''
  const blank = { person_id: initialPerson, work_date: defaultDate, punch_in: '', punch_out: '', reason: '', approve_now: false }
  const [form, setForm] = useState(blank)
  const { pending, errors, submit } = useSubmit(() => {
    setOpen(false)
    setForm(blank)
  })
  const canPickPerson = common.isAdmin && common.people.length > 0
  if (!common.myPersonId && !canPickPerson) return null

  return (
    <>
      <Button variant={common.triggerVariant ?? 'outline'} className={common.className} onClick={() => setOpen(true)}>
        <Clock className="h-4 w-4" aria-hidden />
        {common.triggerLabel ?? 'Forgot to punch?'}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Correct a missed punch"
        description="Give the time you came in or left. An admin approves it, and the punch is added."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit(() => requestCorrection({ ...form, person_id: canPickPerson ? form.person_id : '' }), 'Correction sent for approval')
          }}
        >
          {canPickPerson && (
            <PersonPicker people={common.people} value={form.person_id} onChange={(v) => setForm({ ...form, person_id: v })} error={errors.person_id} />
          )}
          <Field label="Day" htmlFor="corr-date" error={errors.work_date} required>
            <Input id="corr-date" type="date" max={today} value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Came in at" htmlFor="corr-in" error={errors.punch_in} hint="Leave empty if the in punch is there">
              <Input id="corr-in" type="time" value={form.punch_in} onChange={(e) => setForm({ ...form, punch_in: e.target.value })} />
            </Field>
            <Field label="Left at" htmlFor="corr-out" error={errors.punch_out} hint="Leave empty if the out punch is there">
              <Input id="corr-out" type="time" value={form.punch_out} onChange={(e) => setForm({ ...form, punch_out: e.target.value })} />
            </Field>
          </div>
          <Field label="What happened" htmlFor="corr-reason" error={errors.reason} required>
            <Textarea
              id="corr-reason"
              rows={2}
              maxLength={500}
              placeholder="Forgot to punch out; the device was off; at a client site in the morning…"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </Field>
          {common.isAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.approve_now} onChange={(e) => setForm({ ...form, approve_now: e.target.checked })} />
              Approve it now (adds the punch straight away)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {form.approve_now ? 'Add punch' : 'Send for approval'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
