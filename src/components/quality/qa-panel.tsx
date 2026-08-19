'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Trash2,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { QA_BUCKET, QA_RESULT } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { addQaMedia, removeQaMedia, saveQaCheck } from '@/app/(app)/quality/actions'
import type { QaResult } from '@/types/database'

type Media = {
  id: string
  kind: 'photo' | 'video'
  caption: string | null
  signedUrl: string | null
  external_url: string | null
}

type Check = {
  id: string
  report_no: string | null
  checked_on: string
  result: QaResult
  description: string
  observations: string | null
  conditions: string | null
  checkedByName: string | null
  isComplete: boolean
  media: Media[]
}

type Props = {
  orderId: string
  checks: Check[]
  blockReason: string | null
}

/**
 * Shrinks a photo before it leaves the phone.
 *
 * Longest edge 1600px at JPEG quality 80 turns a 4 MB camera photo into
 * roughly 300 KB — still clear enough to inspect a weld or read a gauge, but
 * small enough that the free storage tier holds thousands rather than a few
 * hundred. Done here rather than on the server so the upload itself is fast
 * on a site connection.
 */
class UnreadableImage extends Error {}

async function compress(file: File): Promise<Blob> {
  /*
   * createImageBitmap throws InvalidStateError on anything it cannot decode —
   * a HEIC straight off an iPhone, a part-copied file, a screenshot saved with
   * the wrong extension. That throw used to escape onFile as an unhandled
   * rejection, which is why a QA photo could fail leaving no row, no object in
   * the bucket and nothing at all on screen. Named here so the caller can tell
   * "this file is not readable" apart from "the upload failed".
   */
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new UnreadableImage(
      'That file could not be read as an image. If it came from an iPhone it may be HEIC — ' +
        'take the photo through the app, or save it as JPEG first.'
    )
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)

  const context = canvas.getContext('2d')
  if (!context) return file
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.8)
  )
}

export function QaPanel({ orderId, checks, blockReason }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [videoFor, setVideoFor] = useState<string>()
  const [videoUrl, setVideoUrl] = useState('')
  const [videoCaption, setVideoCaption] = useState('')
  const [uploadingFor, setUploadingFor] = useState<string>()
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingPhotoCheck, setPendingPhotoCheck] = useState<string>()

  const [form, setForm] = useState({
    report_no: '',
    checked_on: new Date().toISOString().slice(0, 10),
    result: 'pass' as QaResult,
    description: '',
    observations: '',
    conditions: '',
  })

  function submitCheck() {
    setError(undefined)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveQaCheck({ ...form, order_id: orderId })
      if (result.ok) {
        toast.success('QA check recorded — now attach the photo and video')
        setOpen(false)
        setForm({ ...form, description: '', observations: '', conditions: '', report_no: '' })
        router.refresh()
      } else {
        setError(result.error)
        setFieldErrors(result.fieldErrors ?? {})
      }
    })
  }

  function choosePhoto(checkId: string) {
    setPendingPhotoCheck(checkId)
    fileInput.current?.click()
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const checkId = pendingPhotoCheck
    event.target.value = ''
    if (!file || !checkId) return

    setUploadingFor(checkId)
    try {
      const blob = await compress(file)
      const path = `${orderId}/${checkId}/${Date.now()}.jpg`
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from(QA_BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg' })

      if (uploadError) {
        // Say what the storage layer actually refused. A bare "could not
        // upload" sent the last person looking at the wrong thing entirely.
        toast.error(`Could not upload that photo — ${uploadError.message}`)
        return
      }

      const result = await addQaMedia(
        { qa_check_id: checkId, kind: 'photo', storage_path: path },
        orderId
      )
      if (result.ok) {
        toast.success('Photo attached')
        router.refresh()
      } else {
        /*
         * The file is in the bucket but nothing points at it. Take it back out
         * rather than leaving an object no screen can reach, and tell the
         * person the photo is not attached — the dispatch gate reads the row,
         * not the bucket, so a silent orphan here reads as "evidence complete"
         * to nobody and blocks the order with no explanation.
         */
        await supabase.storage.from(QA_BUCKET).remove([path])
        toast.error(result.error)
      }
    } catch (cause) {
      /*
       * Nothing below this line may fail quietly. This is the gate that stops
       * goods leaving the building without evidence, so a photo that does not
       * attach has to say so.
       */
      toast.error(
        cause instanceof UnreadableImage
          ? cause.message
          : `Could not attach that photo — ${cause instanceof Error ? cause.message : 'unknown error'}`
      )
    } finally {
      setUploadingFor(undefined)
    }
  }

  function saveVideo() {
    if (!videoFor) return
    startTransition(async () => {
      const result = await addQaMedia(
        {
          qa_check_id: videoFor,
          kind: 'video',
          external_url: videoUrl,
          caption: videoCaption,
        },
        orderId
      )
      if (result.ok) {
        toast.success('Video link added')
        setVideoFor(undefined)
        setVideoUrl('')
        setVideoCaption('')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function drop(mediaId: string) {
    startTransition(async () => {
      const result = await removeQaMedia(mediaId, orderId)
      if (result.ok) router.refresh()
      else toast.error(result.error)
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          Quality check before dispatch
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Record a check
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {blockReason ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-overdue/40 bg-overdue/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-overdue" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-overdue">Dispatch is blocked</p>
              <p className="text-muted-foreground">{blockReason}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-ok/40 bg-ok/5 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
            <p className="text-sm">QA passed with evidence. This order can be dispatched.</p>
          </div>
        )}

        {checks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No check recorded yet. Every order needs one before it leaves — a description of what
            was checked, at least one photo, and a video link.
          </p>
        )}

        <ul className="space-y-4">
          {checks.map((check) => (
            <li key={check.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      check.result === 'fail'
                        ? 'overdue'
                        : check.result === 'conditional_pass'
                          ? 'duesoon'
                          : 'ok'
                    }
                  >
                    {QA_RESULT[check.result]}
                  </Badge>
                  {check.report_no && (
                    <span className="text-sm font-medium">{check.report_no}</span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {formatDate(check.checked_on)}
                    {check.checkedByName ? ` · ${check.checkedByName}` : ''}
                  </span>
                </div>
                {!check.isComplete && (
                  <span className="text-xs text-overdue">Evidence incomplete</span>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm">{check.description}</p>

              {check.conditions && (
                <p className="mt-2 rounded-md bg-duesoon/10 px-2.5 py-1.5 text-sm">
                  <span className="font-medium">Conditions:</span> {check.conditions}
                </p>
              )}

              {check.observations && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {check.observations}
                </p>
              )}

              {check.media.filter((m) => m.kind === 'photo').length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {check.media
                    .filter((m) => m.kind === 'photo')
                    .map((photo) => (
                      <div key={photo.id} className="group relative">
                        <a href={photo.signedUrl ?? '#'} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.signedUrl ?? ''}
                            alt={photo.caption ?? 'QA evidence'}
                            className="aspect-square w-full rounded-md border object-cover"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={() => drop(photo.id)}
                          aria-label="Remove photo"
                          className="absolute right-1 top-1 rounded bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {check.media.filter((m) => m.kind === 'video').length > 0 && (
                <ul className="mt-2 space-y-1">
                  {check.media
                    .filter((m) => m.kind === 'video')
                    .map((video) => (
                      <li key={video.id} className="flex items-center gap-2 text-sm">
                        <Video className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <a
                          href={video.external_url ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-primary hover:underline"
                        >
                          {video.caption || video.external_url}
                        </a>
                        <button
                          type="button"
                          onClick={() => drop(video.id)}
                          aria-label="Remove video link"
                          className="ml-auto text-muted-foreground hover:text-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploadingFor === check.id}
                  onClick={() => choosePhoto(check.id)}
                >
                  {uploadingFor === check.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="h-4 w-4" aria-hidden />
                  )}
                  Add photo
                </Button>
                <Button size="sm" variant="outline" onClick={() => setVideoFor(check.id)}>
                  <Video className="h-4 w-4" aria-hidden />
                  Add video link
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Photos are shrunk on the device before uploading, so they stay clear but small. Videos
          are linked rather than uploaded — keep them in a Drive folder only managers can delete
          from, or the evidence disappears when someone tidies up.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFile}
        />
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Record a QA check"
        description="Save the check first, then attach the photo and video to it."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Report number" htmlFor="qa_report" error={fieldErrors.report_no}>
              <Input
                id="qa_report"
                value={form.report_no}
                placeholder="QA-2026-014"
                onChange={(e) => setForm({ ...form, report_no: e.target.value })}
              />
            </Field>
            <Field label="Checked on" htmlFor="qa_date" required error={fieldErrors.checked_on}>
              <Input
                id="qa_date"
                type="date"
                value={form.checked_on}
                onChange={(e) => setForm({ ...form, checked_on: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Result" htmlFor="qa_result" required>
            <Select
              id="qa_result"
              value={form.result}
              onChange={(e) => setForm({ ...form, result: e.target.value as QaResult })}
            >
              {optionsFrom(QA_RESULT)}
            </Select>
          </Field>

          <Field
            label="What was checked"
            htmlFor="qa_description"
            required
            error={fieldErrors.description}
            hint="This is the record ANK relies on if the client disputes the condition it left in"
          >
            <Textarea
              id="qa_description"
              rows={4}
              value={form.description}
              placeholder="Ran the full pre-dispatch checklist: all dimensions within tolerance, no-load run for 30 minutes, safety interlocks tested."
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          {form.result === 'conditional_pass' && (
            <Field
              label="Conditions"
              htmlFor="qa_conditions"
              required
              error={fieldErrors.conditions}
            >
              <Textarea
                id="qa_conditions"
                rows={2}
                value={form.conditions}
                placeholder="Guard panel to be replaced at site before commissioning."
                onChange={(e) => setForm({ ...form, conditions: e.target.value })}
              />
            </Field>
          )}

          <Field label="Observations" htmlFor="qa_obs" error={fieldErrors.observations}>
            <Textarea
              id="qa_obs"
              rows={2}
              value={form.observations}
              onChange={(e) => setForm({ ...form, observations: e.target.value })}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitCheck} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save check
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(videoFor)}
        onClose={() => !pending && setVideoFor(undefined)}
        title="Add a video link"
        description="Upload the clip to the company Drive folder and paste the share link."
      >
        <div className="space-y-4">
          <Field label="Link" htmlFor="video_url" required>
            <Input
              id="video_url"
              value={videoUrl}
              placeholder="https://drive.google.com/file/d/..."
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </Field>
          <Field label="Caption" htmlFor="video_caption">
            <Input
              id="video_caption"
              value={videoCaption}
              placeholder="Full cycle run, 30 minutes"
              onChange={(e) => setVideoCaption(e.target.value)}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            The video stays in Drive, so its sharing is governed there rather than here. If the
            file is moved or deleted this link stops working — worth keeping QA clips in a folder
            only managers can change.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setVideoFor(undefined)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={saveVideo} disabled={pending || videoUrl.trim().length < 8}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Add link
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
