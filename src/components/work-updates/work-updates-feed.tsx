'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, NotebookPen, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import { addWorkUpdate } from '@/lib/actions/work-updates'
import type { WorkUpdateRow } from '@/types/database'

export type WorkUpdateEntry = WorkUpdateRow & { authorName: string | null }

type Props = {
  parentType: 'order' | 'rnd'
  parentId: string
  updates: WorkUpdateEntry[]
  /** Shown above the feed; drives the parent's progress bar. */
  currentProgress: number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * "Work done for project" feed, shared by orders and R&D projects — the only
 * difference is `parentType`. Posting an update with a progress % lets a
 * database trigger push that figure onto the parent, so the progress bar is
 * always the most recent reported number rather than a second thing to keep
 * in sync by hand.
 */
export function WorkUpdatesFeed({ parentType, parentId, updates, currentProgress }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const [updateDate, setUpdateDate] = useState(today())
  const [note, setNote] = useState('')
  const [progress, setProgress] = useState('')

  function submit() {
    setErrors({})
    setFormError(undefined)

    startTransition(async () => {
      const result = await addWorkUpdate({
        parent_type: parentType,
        parent_id: parentId,
        update_date: updateDate,
        note,
        progress_pct: progress,
      })

      if (result.ok) {
        toast.success('Update posted')
        setOpen(false)
        setNote('')
        setProgress('')
        setUpdateDate(today())
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
          <CardTitle className="text-base">Work updates</CardTitle>
          <p className="text-sm text-muted-foreground">
            {updates.length} posted · {currentProgress}% complete
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Post update
        </Button>
      </CardHeader>

      <CardContent>
        {updates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <NotebookPen className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No updates yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Post dated progress notes here. Adding a % moves the progress bar.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-4 border-l pl-6">
            {updates.map((update) => (
              <li key={update.id} className="relative">
                <span className="absolute -left-[1.72rem] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-card" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{formatDate(update.update_date)}</span>
                  {update.progress_pct != null && (
                    <Badge variant="default">{update.progress_pct}%</Badge>
                  )}
                  {update.authorName && (
                    <span className="text-xs text-muted-foreground">{update.authorName}</span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{update.note}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Post a work update"
        description="Dated progress note. Include a % only when it actually moved."
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="update_date" required error={errors.update_date}>
              <Input
                id="update_date"
                type="date"
                value={updateDate}
                onChange={(e) => setUpdateDate(e.target.value)}
              />
            </Field>
            <Field
              label="Progress %"
              htmlFor="progress_pct"
              error={errors.progress_pct}
              hint="Leave blank if unchanged"
            >
              <Input
                id="progress_pct"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              />
            </Field>
          </div>

          <Field label="What was done" htmlFor="work_note" required error={errors.note}>
            <Textarea
              id="work_note"
              rows={4}
              autoFocus
              value={note}
              placeholder="Panel wiring completed, awaiting client inspection."
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || note.trim().length < 3}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Post update
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
