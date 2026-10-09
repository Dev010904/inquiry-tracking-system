'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { DayMark } from '@/components/attendance/day-mark'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  addManualPunch,
  clearDayOverride,
  deletePunch,
  requestCorrection,
  setDayOverride,
  type AttendanceResult,
} from '@/lib/actions/attendance'
import type { DayResult } from '@/lib/attendance/compute'
import { OVERRIDE_STATUS, PUNCH_SOURCE } from '@/lib/attendance/labels'
import { WEEKDAY_SHORT, formatClock, formatDayLong, formatDuration } from '@/lib/attendance/time'
import { cn } from '@/lib/utils'

type Mode = 'mark' | 'punch' | 'correct'

/**
 * One person's month, a day a row, with every punch and where it came from.
 *
 * An admin fixes a day here — marks it (on duty, leave, present…) or adds the
 * punch the device missed, always with a reason that goes into Recent changes.
 * Anyone else asks for a correction, which an admin approves.
 */
export function PersonMonthTable({
  personId,
  days,
  isAdmin,
  canRequest,
  leaveTypes,
  today,
}: {
  personId: string
  days: DayResult[]
  isAdmin: boolean
  canRequest: boolean
  leaveTypes: { id: string; code: string; name: string }[]
  today: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState<{ mode: Mode; day: DayResult } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [mark, setMark] = useState({ status: 'present', leave_type_id: '', note: '' })
  const [punch, setPunch] = useState({ time: '09:30', note: '' })
  const [correct, setCorrect] = useState({ punch_in: '', punch_out: '', reason: '' })

  function run(fn: () => Promise<AttendanceResult>, success: string, close = true) {
    start(async () => {
      const result = await fn()
      if (result.ok) {
        toast.success(result.message ?? success)
        setErrors({})
        if (close) setOpen(null)
        router.refresh()
      } else {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  function openFor(mode: Mode, day: DayResult) {
    setErrors({})
    if (mode === 'mark') setMark({ status: 'present', leave_type_id: leaveTypes[0]?.id ?? '', note: day.overridden ? day.note ?? '' : '' })
    if (mode === 'punch') setPunch({ time: day.firstIn === null ? '09:30' : '18:30', note: '' })
    if (mode === 'correct') setCorrect({ punch_in: '', punch_out: '', reason: '' })
    setOpen({ mode, day })
  }

  const shown = days.filter((d) => d.date <= today)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Day</th>
              <th className="py-2 pr-2 font-medium">Status</th>
              <th className="py-2 pr-2 font-medium">In</th>
              <th className="py-2 pr-2 font-medium">Out</th>
              <th className="py-2 pr-2 text-right font-medium">Worked</th>
              <th className="py-2 pr-2 text-right font-medium">Late</th>
              <th className="py-2 pr-2 text-right font-medium">Overtime</th>
              <th className="py-2 pr-2 font-medium">Punches</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {shown
              .slice()
              .reverse()
              .map((d) => (
                <tr key={d.date} className={cn('border-b align-top last:border-0', (d.weekday === 7 || d.code === 'H') && 'bg-muted/30')}>
                  <td className="whitespace-nowrap py-2 pr-2">
                    <span className="tnum font-medium">{Number(d.date.slice(8, 10))}</span>{' '}
                    <span className="text-muted-foreground">{WEEKDAY_SHORT[d.weekday]}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <DayMark day={d} />
                      <span>{d.label}</span>
                    </div>
                    {d.note && <p className="mt-1 text-xs text-muted-foreground">Marked by admin: {d.note}</p>}
                    {d.workedOnOffDay && <p className="mt-1 text-xs text-muted-foreground">Worked on a day off</p>}
                  </td>
                  <td className="py-2 pr-2 tnum">{formatClock(d.firstIn)}</td>
                  <td className="py-2 pr-2 tnum">{formatClock(d.lastOut)}</td>
                  <td className="py-2 pr-2 text-right tnum">{formatDuration(d.workedMinutes)}</td>
                  <td className={cn('py-2 pr-2 text-right tnum', d.isLate && 'font-medium text-overdue')}>
                    {d.isLate ? formatDuration(d.lateMinutes) : '—'}
                  </td>
                  <td className="py-2 pr-2 text-right tnum">{d.overtimeMinutes ? formatDuration(d.overtimeMinutes) : '—'}</td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap gap-1">
                      {d.punches.map((p) => (
                        <span
                          key={p.id}
                          title={`${PUNCH_SOURCE[p.source as keyof typeof PUNCH_SOURCE] ?? p.source}${p.note ? ` — ${p.note}` : ''}`}
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tnum',
                            p.source === 'device' ? 'bg-card' : 'border-primary/30 bg-primary/5'
                          )}
                        >
                          {formatClock(p.minutes)}
                          {p.source !== 'device' && p.source !== 'import' && (
                            <span className="text-[10px] text-primary">{p.source === 'manual' ? 'admin' : 'corr.'}</span>
                          )}
                          {isAdmin && (p.source === 'manual' || p.source === 'correction') && (
                            <button
                              type="button"
                              aria-label={`Remove the ${formatClock(p.minutes)} punch`}
                              className="text-muted-foreground hover:text-destructive"
                              disabled={pending}
                              onClick={() => {
                                if (confirm(`Remove the ${formatClock(p.minutes)} punch?`)) run(() => deletePunch(p.id), 'Punch removed', false)
                              }}
                            >
                              <X className="h-3 w-3" aria-hidden />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    {isAdmin ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openFor('punch', d)}>
                          Add punch
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openFor('mark', d)}>
                          Mark day
                        </Button>
                      </div>
                    ) : (
                      canRequest &&
                      d.code !== '' && (
                        <Button size="sm" variant="ghost" onClick={() => openFor('correct', d)}>
                          Correct
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open?.mode === 'mark'}
        onClose={() => setOpen(null)}
        title={open ? `Mark ${formatDayLong(open.day.date)}` : 'Mark day'}
        description="Your mark wins over the punches, the holiday list and leave. The reason is kept in Recent changes."
      >
        {open?.mode === 'mark' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => setDayOverride({ person_id: personId, work_date: open.day.date, ...mark }), 'Day marked')
            }}
          >
            <Field label="Mark it as" htmlFor="mark-status" required>
              <Select id="mark-status" value={mark.status} onChange={(e) => setMark({ ...mark, status: e.target.value })}>
                {Object.entries(OVERRIDE_STATUS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {mark.status === 'leave' && (
              <Field label="Leave type" htmlFor="mark-leave" error={errors.leave_type_id} required>
                <Select id="mark-leave" value={mark.leave_type_id} onChange={(e) => setMark({ ...mark, leave_type_id: e.target.value })}>
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Reason" htmlFor="mark-note" error={errors.note} required>
              <Textarea
                id="mark-note"
                rows={2}
                maxLength={300}
                placeholder="At the client's site all day; device was off; approved on the phone…"
                value={mark.note}
                onChange={(e) => setMark({ ...mark, note: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap justify-between gap-2">
              {open.day.overridden ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => clearDayOverride(personId, open.day.date), 'Mark removed')}
                >
                  Remove my mark
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Save
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={open?.mode === 'punch'}
        onClose={() => setOpen(null)}
        title={open ? `Add a punch on ${formatDayLong(open.day.date)}` : 'Add a punch'}
        description="For a punch the device did not record. It shows as added by an admin, with your reason."
      >
        {open?.mode === 'punch' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => addManualPunch({ person_id: personId, date: open.day.date, ...punch }), 'Punch added')
            }}
          >
            <Field label="Time" htmlFor="punch-time" error={errors.time} required>
              <Input id="punch-time" type="time" value={punch.time} onChange={(e) => setPunch({ ...punch, time: e.target.value })} />
            </Field>
            <Field label="Reason" htmlFor="punch-note" error={errors.note} required>
              <Textarea id="punch-note" rows={2} maxLength={300} value={punch.note} onChange={(e) => setPunch({ ...punch, note: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Add punch
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={open?.mode === 'correct'}
        onClose={() => setOpen(null)}
        title={open ? `Correct ${formatDayLong(open.day.date)}` : 'Correct a day'}
        description="Give the time you came in or left. An admin approves it, and the punch is added."
      >
        {open?.mode === 'correct' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => requestCorrection({ work_date: open.day.date, ...correct }), 'Correction sent for approval')
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Came in at" htmlFor="c-in" error={errors.punch_in}>
                <Input id="c-in" type="time" value={correct.punch_in} onChange={(e) => setCorrect({ ...correct, punch_in: e.target.value })} />
              </Field>
              <Field label="Left at" htmlFor="c-out" error={errors.punch_out}>
                <Input id="c-out" type="time" value={correct.punch_out} onChange={(e) => setCorrect({ ...correct, punch_out: e.target.value })} />
              </Field>
            </div>
            <Field label="What happened" htmlFor="c-reason" error={errors.reason} required>
              <Textarea id="c-reason" rows={2} maxLength={500} value={correct.reason} onChange={(e) => setCorrect({ ...correct, reason: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Send for approval
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
