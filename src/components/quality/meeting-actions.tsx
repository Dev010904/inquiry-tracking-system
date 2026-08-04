'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BellRing, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import { deleteMeetingAction, saveMeetingAction } from '@/app/(app)/quality/actions'
import type { MeetingActionRow } from '@/types/database'

type Props = {
  meetingId: string
  actions: MeetingActionRow[]
  people: { id: string; full_name: string }[]
  /** False when the meeting has no inquiry or order behind it. */
  canAlarm: boolean
}

/**
 * Action items.
 *
 * An item with an owner and a due date becomes a real follow-up, so it
 * appears on the dashboard alarm panel. That is the whole reason to write
 * minutes in a system rather than a document — minutes nobody is reminded
 * about are minutes nobody reads.
 */
export function MeetingActions({ meetingId, actions, people, canAlarm }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ action: '', owner_id: '', due_on: '' })

  function submit() {
    startTransition(async () => {
      const result = await saveMeetingAction({ ...form, meeting_id: meetingId })
      if (result.ok) {
        toast.success(
          form.owner_id && form.due_on ? 'Action added, and a follow-up with it' : 'Action added'
        )
        setOpen(false)
        setForm({ action: '', owner_id: '', due_on: '' })
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function toggle(action: MeetingActionRow) {
    startTransition(async () => {
      const result = await saveMeetingAction({
        id: action.id,
        meeting_id: meetingId,
        action: action.action,
        owner_id: action.owner_id ?? '',
        due_on: action.due_on ?? '',
        is_done: !action.is_done,
      })
      if (result.ok) router.refresh()
      else toast.error(result.error)
    })
  }

  function remove(actionId: string) {
    startTransition(async () => {
      const result = await deleteMeetingAction(actionId, meetingId)
      if (result.ok) router.refresh()
      else toast.error(result.error)
    })
  }

  const nameById = new Map(people.map((p) => [p.id, p.full_name]))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Action items</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add action
        </Button>
      </div>

      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing recorded. An action with an owner and a due date will also appear on the alarm
          panel, so it does not get forgotten.
        </p>
      ) : (
        <ul className="divide-y">
          {actions.map((action) => (
            <li key={action.id} className="flex items-start gap-3 py-2">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={action.is_done}
                onChange={() => toggle(action)}
                aria-label={`Mark "${action.action}" done`}
              />
              <div className="min-w-0 flex-1">
                <p className={action.is_done ? 'text-sm line-through opacity-60' : 'text-sm'}>
                  {action.action}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {action.owner_id ? (nameById.get(action.owner_id) ?? 'Someone') : 'No owner'}
                  {action.due_on && ` · due ${formatDate(action.due_on)}`}
                  {action.followup_id && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <BellRing className="h-3 w-3" aria-hidden />
                      on the alarm panel
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(action.id)}
                aria-label="Remove action"
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Add an action item"
        description="Give it an owner and a due date and it becomes a follow-up too."
      >
        <div className="space-y-4">
          <Field label="What needs doing" htmlFor="a_action" required>
            <Input
              id="a_action"
              value={form.action}
              placeholder="Send revised layout drawing"
              onChange={(e) => setForm({ ...form, action: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner" htmlFor="a_owner">
              <Select
                id="a_owner"
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
              >
                <option value="">Nobody yet</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Due" htmlFor="a_due">
              <Input
                id="a_due"
                type="date"
                value={form.due_on}
                onChange={(e) => setForm({ ...form, due_on: e.target.value })}
              />
            </Field>
          </div>

          {!canAlarm && form.owner_id && form.due_on && (
            <p className="text-xs text-muted-foreground">
              These minutes are not linked to an inquiry or an order, so this action is recorded
              here but will not appear on the alarm panel. Link the meeting to raise an alarm.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || form.action.trim().length < 3}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
