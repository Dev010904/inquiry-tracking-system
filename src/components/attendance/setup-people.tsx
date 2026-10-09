'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { addPerson, removePerson, updatePerson, type AttendanceResult } from '@/lib/actions/attendance'
import { formatDateTimeIST } from '@/lib/format'
import type { AttendancePerson, UnmatchedCode } from '@/lib/queries/attendance'
import type { AttendanceShiftRow } from '@/types/database'

type Candidate = { id: string; full_name: string; email: string | null }

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

/**
 * Who is on attendance. One list of people, the same staff accounts as
 * everywhere else: an admin picks an existing account and gives it the number
 * that person is enrolled under on the fingerprint device. Accounts are made in
 * Settings → Staff accounts first.
 */
export function SetupPeople({
  people,
  candidates,
  shifts,
  unmatched,
  today,
}: {
  people: AttendancePerson[]
  candidates: Candidate[]
  shifts: AttendanceShiftRow[]
  unmatched: UnmatchedCode[]
  today: string
}) {
  const defaultShift = shifts.find((s) => s.is_default)?.id ?? shifts[0]?.id ?? ''
  const blank = { profile_id: candidates[0]?.id ?? '', device_code: '', shift_id: defaultShift, tracked_from: today }
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<AttendancePerson | null>(null)
  const [edit, setEdit] = useState({ device_code: '', shift_id: '', tracked_from: '', is_active: true })
  const { pending, errors, run } = useRun()

  function startAdd(code = '') {
    setForm({ ...blank, profile_id: candidates[0]?.id ?? '', device_code: code })
    setAdding(true)
  }

  return (
    <Card id="people">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">People on attendance</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a staff account and enter the number they are enrolled under on the device. Someone without an account
            is added in Settings → Staff accounts first.
          </p>
        </div>
        <Button size="sm" onClick={() => startAdd()} disabled={candidates.length === 0}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Add person
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {people.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Device no.</th>
                  <th className="py-2 font-medium">Shift</th>
                  <th className="py-2 font-medium">Counted from</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">
                      <span className="font-medium">{p.full_name}</span>
                      {!p.is_active && (
                        <Badge variant="muted" className="ml-2">
                          Not tracked
                        </Badge>
                      )}
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </td>
                    <td className="py-2 tnum">{p.device_code}</td>
                    <td className="py-2">{p.shift.name}</td>
                    <td className="py-2 tnum">{p.tracked_from}</td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEdit({ device_code: p.device_code, shift_id: p.shift_id, tracked_from: p.tracked_from, is_active: p.is_active })
                          setEditing(p)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Change
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {unmatched.length > 0 && (
          <div className="rounded-md border border-duesoon/40 bg-duesoon/10 p-3 text-sm">
            <p className="font-medium">Punches from numbers nobody has yet</p>
            <p className="text-muted-foreground">
              The device sent these, but no one on attendance has the number. Give the number to the right person and the
              punches move to them.
            </p>
            <ul className="mt-2 space-y-1">
              {unmatched.map((u) => (
                <li key={u.code} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold tnum">No. {u.code}</span> · {u.count} punch{u.count === 1 ? '' : 'es'} · last{' '}
                    {formatDateTimeIST(u.last)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => startAdd(u.code)} disabled={candidates.length === 0}>
                    Give this number to…
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a person to attendance">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => addPerson(form), 'Added to attendance', () => setAdding(false))
          }}
        >
          <Field label="Staff account" htmlFor="ap-profile" error={errors.profile_id} required>
            <Select id="ap-profile" value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.email ? ` (${c.email})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Device number"
            htmlFor="ap-code"
            error={errors.device_code}
            hint="The user ID / enrolment number on the fingerprint device"
            required
          >
            <Input id="ap-code" inputMode="numeric" maxLength={24} value={form.device_code} onChange={(e) => setForm({ ...form, device_code: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shift" htmlFor="ap-shift" error={errors.shift_id} required>
              <Select id="ap-shift" value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })}>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Count attendance from" htmlFor="ap-from" error={errors.tracked_from} required>
              <Input id="ap-from" type="date" value={form.tracked_from} onChange={(e) => setForm({ ...form, tracked_from: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Add
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? editing.full_name : 'Change'}>
        {editing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => updatePerson(editing.id, edit), 'Saved', () => setEditing(null))
            }}
          >
            <Field label="Device number" htmlFor="ep-code" error={errors.device_code} required>
              <Input id="ep-code" maxLength={24} value={edit.device_code} onChange={(e) => setEdit({ ...edit, device_code: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shift" htmlFor="ep-shift" required>
                <Select id="ep-shift" value={edit.shift_id} onChange={(e) => setEdit({ ...edit, shift_id: e.target.value })}>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Count attendance from" htmlFor="ep-from" error={errors.tracked_from} required>
                <Input id="ep-from" type="date" value={edit.tracked_from} onChange={(e) => setEdit({ ...edit, tracked_from: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
              Track this person&rsquo;s attendance
            </label>
            <p className="text-xs text-muted-foreground">
              Untick to stop tracking someone who has left. Their history stays in the register.
            </p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Take ${editing.full_name} off attendance completely? Only possible while nothing has been recorded for them.`))
                    run(() => removePerson(editing.id), 'Removed', () => setEditing(null))
                }}
              >
                Remove
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
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
    </Card>
  )
}
