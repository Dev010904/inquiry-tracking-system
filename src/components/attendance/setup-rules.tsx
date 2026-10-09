'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import {
  deleteHoliday,
  deleteLeaveType,
  deleteShift,
  saveHoliday,
  saveLeaveType,
  saveShift,
  type AttendanceResult,
} from '@/lib/actions/attendance'
import { WEEKDAY_OPTIONS } from '@/lib/attendance/labels'
import { formatClock, formatDayLong, timeToMinutes } from '@/lib/attendance/time'
import type { AttendanceHolidayRow, AttendanceLeaveTypeRow, AttendanceShiftRow } from '@/types/database'

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  return {
    pending,
    errors,
    setErrors,
    run(fn: () => Promise<AttendanceResult>, success: string, after?: () => void) {
      start(async () => {
        const result = await fn()
        if (result.ok) {
          toast.success(result.message ?? success)
          setErrors({})
          after?.()
          router.refresh()
        } else {
          setErrors(result.fieldErrors ?? {})
          toast.error(result.error)
        }
      })
    },
  }
}

const hours = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100)

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

type ShiftForm = {
  name: string
  start_time: string
  end_time: string
  grace_minutes: string
  half_day_hours: string
  full_day_hours: string
  weekly_offs: number[]
  late_marks_per_half_day: string
  overtime_after_minutes: string
}

function toForm(s?: AttendanceShiftRow): ShiftForm {
  return {
    name: s?.name ?? '',
    start_time: s?.start_time.slice(0, 5) ?? '09:30',
    end_time: s?.end_time.slice(0, 5) ?? '18:30',
    grace_minutes: String(s?.grace_minutes ?? 15),
    half_day_hours: hours(s?.half_day_minutes ?? 240),
    full_day_hours: hours(s?.full_day_minutes ?? 420),
    weekly_offs: s?.weekly_offs ?? [7],
    late_marks_per_half_day: String(s?.late_marks_per_half_day ?? 0),
    overtime_after_minutes: String(s?.overtime_after_minutes ?? 30),
  }
}

export function SetupShifts({ shifts }: { shifts: AttendanceShiftRow[] }) {
  const [open, setOpen] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<ShiftForm>(toForm())
  const { pending, errors, run } = useRun()

  function submit() {
    const payload = {
      name: form.name,
      start_time: form.start_time,
      end_time: form.end_time,
      grace_minutes: form.grace_minutes,
      half_day_minutes: Math.round(Number(form.half_day_hours) * 60),
      full_day_minutes: Math.round(Number(form.full_day_hours) * 60),
      weekly_offs: form.weekly_offs,
      late_marks_per_half_day: form.late_marks_per_half_day,
      overtime_after_minutes: form.overtime_after_minutes,
    }
    run(() => saveShift(open?.id ?? null, payload), 'Shift saved', () => setOpen(null))
  }

  return (
    <Card id="shifts">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Office timings (shifts)</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            When the day starts and ends, how late is late, and how many hours make a full or a half day.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setForm(toForm())
            setOpen({ id: null })
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add shift
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border">
          {shifts.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-medium">
                  {s.name} {s.is_default && <Badge variant="secondary">Default</Badge>}
                </p>
                <p className="text-muted-foreground">
                  {formatClock(timeToMinutes(s.start_time))}–{formatClock(timeToMinutes(s.end_time))} · late after{' '}
                  {s.grace_minutes} min · full day {hours(s.full_day_minutes)} h, half day {hours(s.half_day_minutes)} h · off{' '}
                  {s.weekly_offs.length ? s.weekly_offs.map((d) => WEEKDAY_OPTIONS.find(([n]) => n === d)?.[1]).join(', ') : 'none'}
                  {s.late_marks_per_half_day > 0 && ` · every ${s.late_marks_per_half_day} late marks = half day cut`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm(toForm(s))
                    setOpen({ id: s.id })
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Change
                </Button>
                {!s.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Delete ${s.name}`}
                    onClick={() => {
                      if (confirm(`Delete the ${s.name} shift?`)) run(() => deleteShift(s.id), 'Shift deleted')
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.id ? 'Change shift' : 'Add a shift'} className="max-w-xl">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label="Name" htmlFor="sh-name" error={errors.name} required>
            <Input id="sh-name" maxLength={40} placeholder="General, Workshop, Saturday…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Starts" htmlFor="sh-start" error={errors.start_time} required>
              <Input id="sh-start" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="Ends" htmlFor="sh-end" error={errors.end_time} required>
              <Input id="sh-end" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </Field>
            <Field label="Late after (min)" htmlFor="sh-grace" error={errors.grace_minutes} hint="Minutes of grace">
              <Input id="sh-grace" type="number" min={0} max={240} value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full day needs (hours)" htmlFor="sh-full" error={errors.full_day_minutes} hint="From first to last punch">
              <Input id="sh-full" type="number" step="0.25" min={0.25} max={24} value={form.full_day_hours} onChange={(e) => setForm({ ...form, full_day_hours: e.target.value })} />
            </Field>
            <Field label="Half day needs (hours)" htmlFor="sh-half" error={errors.half_day_minutes} hint="Less than this is absent">
              <Input id="sh-half" type="number" step="0.25" min={0} max={24} value={form.half_day_hours} onChange={(e) => setForm({ ...form, half_day_hours: e.target.value })} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Weekly off</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map(([n, label]) => (
                <label key={n} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form.weekly_offs.includes(n)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        weekly_offs: e.target.checked ? [...form.weekly_offs, n].sort() : form.weekly_offs.filter((d) => d !== n),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            {errors.weekly_offs && <p className="mt-1 text-sm text-destructive">{errors.weekly_offs}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Alternate Saturdays off? Add those Saturdays as holidays.</p>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Late marks for a half-day cut"
              htmlFor="sh-late"
              error={errors.late_marks_per_half_day}
              hint="0 = off. 3 means every 3rd late arrival in a month costs half a day."
            >
              <Input id="sh-late" type="number" min={0} max={31} value={form.late_marks_per_half_day} onChange={(e) => setForm({ ...form, late_marks_per_half_day: e.target.value })} />
            </Field>
            <Field label="Overtime counts after (min)" htmlFor="sh-ot" error={errors.overtime_after_minutes} hint="Extra time beyond the shift">
              <Input id="sh-ot" type="number" min={0} max={600} value={form.overtime_after_minutes} onChange={(e) => setForm({ ...form, overtime_after_minutes: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

export function SetupHolidays({ holidays, today }: { holidays: AttendanceHolidayRow[]; today: string }) {
  const [form, setForm] = useState({ holiday_on: today, name: '' })
  const { pending, errors, run } = useRun()
  const upcoming = holidays.filter((h) => h.holiday_on >= `${today.slice(0, 4)}-01-01`)
  const year = today.slice(0, 4)

  return (
    <Card id="holidays">
      <CardHeader>
        <CardTitle className="text-base">Holidays</CardTitle>
        <p className="text-sm text-muted-foreground">
          Paid days off for everyone. Someone who works on one has the hours counted as overtime.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => saveHoliday(null, form), 'Holiday added', () => setForm({ holiday_on: form.holiday_on, name: '' }))
          }}
        >
          <Field label="Date" htmlFor="hol-date" error={errors.holiday_on} className="w-44">
            <Input id="hol-date" type="date" value={form.holiday_on} onChange={(e) => setForm({ ...form, holiday_on: e.target.value })} />
          </Field>
          <Field label="Holiday" htmlFor="hol-name" error={errors.name} className="min-w-[12rem] flex-1">
            <Input id="hol-name" maxLength={80} placeholder="Diwali, Republic Day…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Add
          </Button>
        </form>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holidays entered for {year} yet.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {upcoming.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="tnum">{formatDayLong(h.holiday_on)}</span> · <span className="font-medium">{h.name}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${h.name}`}
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete the ${h.name} holiday?`)) run(() => deleteHoliday(h.id), 'Holiday deleted')
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

type LeaveTypeForm = {
  code: string
  name: string
  is_paid: boolean
  counts_as_present: boolean
  yearly_quota: string
  is_active: boolean
  sort_order: string
}

export function SetupLeaveTypes({ leaveTypes }: { leaveTypes: AttendanceLeaveTypeRow[] }) {
  const [open, setOpen] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<LeaveTypeForm>({ code: '', name: '', is_paid: true, counts_as_present: false, yearly_quota: '', is_active: true, sort_order: '10' })
  const { pending, errors, run } = useRun()

  function edit(t?: AttendanceLeaveTypeRow) {
    setForm({
      code: t?.code ?? '',
      name: t?.name ?? '',
      is_paid: t?.is_paid ?? true,
      counts_as_present: t?.counts_as_present ?? false,
      yearly_quota: t?.yearly_quota === null || t?.yearly_quota === undefined ? '' : String(t.yearly_quota),
      is_active: t?.is_active ?? true,
      sort_order: String(t?.sort_order ?? leaveTypes.length + 1),
    })
    setOpen({ id: t?.id ?? null })
  }

  return (
    <Card id="leave-types">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Leave types</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Days a financial year (April to March). Empty means no limit.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => edit()}>
          <Plus className="h-4 w-4" aria-hidden />
          Add type
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border text-sm">
          {leaveTypes.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className={t.is_active ? '' : 'opacity-60'}>
                <span className="font-semibold">{t.code}</span> {t.name} ·{' '}
                <span className="text-muted-foreground">
                  {t.yearly_quota === null ? 'no limit' : `${t.yearly_quota} a year`}
                  {!t.is_paid && ' · unpaid'}
                  {t.counts_as_present && ' · counts as present'}
                  {!t.is_active && ' · off'}
                </span>
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => edit(t)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Change
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${t.code}`}
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete leave type ${t.code}?`)) run(() => deleteLeaveType(t.id), 'Leave type deleted')
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.id ? 'Change leave type' : 'Add a leave type'}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => saveLeaveType(open?.id ?? null, form), 'Leave type saved', () => setOpen(null))
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Code" htmlFor="lt-code" error={errors.code} required>
              <Input id="lt-code" maxLength={5} disabled={!!open?.id} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Name" htmlFor="lt-name" error={errors.name} className="sm:col-span-2" required>
              <Input id="lt-name" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Days a year" htmlFor="lt-quota" error={errors.yearly_quota} hint="Empty = no limit">
              <Input id="lt-quota" type="number" step="0.5" min={0} max={366} value={form.yearly_quota} onChange={(e) => setForm({ ...form, yearly_quota: e.target.value })} />
            </Field>
            <Field label="Order in lists" htmlFor="lt-order" error={errors.sort_order}>
              <Input id="lt-order" type="number" min={0} max={999} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </Field>
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={form.is_paid} onChange={(e) => setForm({ ...form, is_paid: e.target.checked })} />
              Paid leave
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={form.counts_as_present} onChange={(e) => setForm({ ...form, counts_as_present: e.target.checked })} />
              Counts as present (on duty: a site visit, a client meeting)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              In use
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}
