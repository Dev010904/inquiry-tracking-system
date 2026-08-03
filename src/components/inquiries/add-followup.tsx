'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, optionsFrom } from '@/components/ui/select'
import { FOLLOWUP_CHANNEL, type FollowupChannel } from '@/lib/constants'
import { addFollowup } from '@/app/(app)/inquiries/actions'

function inThreeDays(): string {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  date.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function AddFollowup({ inquiryId }: { inquiryId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [dueAt, setDueAt] = useState(inThreeDays())
  const [channel, setChannel] = useState<FollowupChannel>('call')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()

  function submit() {
    setError(undefined)
    startTransition(async () => {
      const result = await addFollowup({
        inquiry_id: inquiryId,
        due_at: dueAt,
        channel,
        note: note.trim(),
      })
      if (result.ok) {
        toast.success('Follow-up scheduled')
        setOpen(false)
        setNote('')
        setDueAt(inThreeDays())
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-4 w-4" aria-hidden />
        Schedule follow-up
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Schedule a follow-up"
        description="It appears on the dashboard alarm panel from its due date."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due" htmlFor="fu-due" required>
              <Input
                id="fu-due"
                type="datetime-local"
                value={dueAt}
                autoFocus
                onChange={(e) => setDueAt(e.target.value)}
              />
            </Field>
            <Field label="Channel" htmlFor="fu-channel">
              <Select
                id="fu-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as FollowupChannel)}
              >
                {optionsFrom(FOLLOWUP_CHANNEL)}
              </Select>
            </Field>
          </div>

          <Field label="Note" htmlFor="fu-note" required hint="What needs to happen">
            <Input
              id="fu-note"
              value={note}
              placeholder="Call about the revised quotation"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !note.trim()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Schedule
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
