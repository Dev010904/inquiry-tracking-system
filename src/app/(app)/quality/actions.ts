'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { dbMessage } from '@/lib/db-message'
import { QA_BUCKET } from '@/lib/constants'
import {
  meetingActionSchema,
  meetingSchema,
  qaCheckSchema,
  qaMediaSchema,
  qualificationSchema,
} from '@/lib/schemas/quality'

export type Result =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

const blank = (v: string | undefined | null) => (v && v.trim() !== '' ? v.trim() : null)

/** Names arrive as one per line; stored as an array. */
const toList = (v: string | undefined) =>
  (v ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/* ---------------------------------------------------------------- QA ---- */

export async function saveQaCheck(input: unknown): Promise<Result> {
  const profile = await editorOrNull('orders')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = qaCheckSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data

  if (v.result === 'conditional_pass' && !blank(v.conditions)) {
    return {
      ok: false,
      error: 'A conditional pass needs the conditions written down.',
      fieldErrors: { conditions: 'Say what the conditions are' },
    }
  }

  const supabase = await createClient()
  const fields = {
    report_no: blank(v.report_no),
    checked_on: v.checked_on,
    result: v.result,
    description: v.description,
    observations: blank(v.observations),
    conditions: blank(v.conditions),
  }

  if (v.id) {
    const { error } = await supabase.from('qa_checks').update(fields).eq('id', v.id)
    if (error) return { ok: false, error: 'Could not save the QA check.' }
    revalidatePath(`/orders/${v.order_id}`)
    return { ok: true, id: v.id }
  }

  const { data, error } = await supabase
    .from('qa_checks')
    .insert({
      ...fields,
      order_id: v.order_id,
      checked_by: profile.id,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: 'Could not save the QA check.' }

  revalidatePath(`/orders/${v.order_id}`)
  return { ok: true, id: data.id }
}

const uuid = z.string().uuid()

export type PhotoUpload =
  | { ok: true; path: string; uploadUrl: string }
  | { ok: false; error: string }

/**
 * Hands the browser a one-off permission to upload one QA photo.
 *
 * The browser used to upload with the signed-in session itself, which meant
 * the session had to be readable by page scripts. Now the server checks the
 * caller and the check, picks the path, and asks Storage for a signed upload
 * token for exactly that path; the browser can put one file there and nothing
 * else. Storage applies the bucket's own limits (JPEG, PNG or WebP, 5 MB).
 */
export async function startQaPhotoUpload(orderId: string, checkId: string): Promise<PhotoUpload> {
  if (!(await editorOrNull('orders'))) return NO_FEATURE_ACCESS
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(checkId).success) {
    return { ok: false, error: 'Unrecognised QA check.' }
  }

  const supabase = await createClient()
  const { data: check } = await supabase
    .from('qa_checks')
    .select('id')
    .eq('id', checkId)
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!check) return { ok: false, error: 'That QA check no longer exists.' }

  // The same layout the dispatch gate checks: <order>/<check>/<file>.
  const path = `${orderId}/${checkId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`
  const { data, error } = await supabase.storage.from(QA_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { ok: false, error: 'Could not start the upload. Try again.' }

  // The URL carries the token. It is good for this one path only, and Storage
  // refuses a second file at the same path.
  return { ok: true, path: data.path, uploadUrl: data.signedUrl }
}

/**
 * Records a piece of evidence.
 *
 * Photos are uploaded to a private bucket by the browser before this runs —
 * the file is compressed client-side, so what arrives is already small.
 * Videos are stored as links, which keeps the free storage tier viable.
 */
export async function addQaMedia(input: unknown, orderId: string): Promise<Result> {
  const profile = await editorOrNull('orders')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = qaMediaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message, fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const storagePath = blank(v.storage_path)

  // A photo is the file just uploaded for this check; a video is a link. The
  // database checks the same again (guard_qa_media), with the order taken from
  // the check rather than from this request.
  if (v.kind === 'photo') {
    if (!storagePath || !storagePath.startsWith(`${orderId}/${v.qa_check_id}/`) || storagePath.includes('..')) {
      return { ok: false, error: 'That photo does not belong to this QA check.' }
    }
  } else if (storagePath) {
    return { ok: false, error: 'A video is added as a link, not uploaded.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('qa_media').insert({
    qa_check_id: v.qa_check_id,
    kind: v.kind,
    storage_path: storagePath,
    external_url: blank(v.external_url),
    caption: blank(v.caption),
    uploaded_by: profile.id,
  })

  if (error) {
    // The file is in the bucket but nothing points at it. Take it back out
    // where the bucket allows (admins), so an orphan is the exception.
    if (storagePath) await supabase.storage.from(QA_BUCKET).remove([storagePath])
    // The database refuses in a sentence naming what is wrong; discarding it
    // is what made this path impossible to diagnose from the screen.
    return { ok: false, error: dbMessage(error.message, 'Could not attach that evidence.') }
  }

  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}

export async function removeQaMedia(mediaId: string, orderId: string): Promise<Result> {
  if (!(await editorOrNull('orders'))) return NO_FEATURE_ACCESS
  if (!uuid.safeParse(mediaId).success) return { ok: false, error: 'Unrecognised evidence.' }

  const supabase = await createClient()
  const { data: media } = await supabase
    .from('qa_media')
    .select('storage_path')
    .eq('id', mediaId)
    .maybeSingle()

  const { error } = await supabase.from('qa_media').delete().eq('id', mediaId)
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not remove that.') }

  // The photo file goes too where the bucket allows it (admins). For anyone
  // else the file stays, unreferenced, as before — evidence is only ever
  // destroyed by an admin.
  if (media?.storage_path) {
    await supabase.storage.from(QA_BUCKET).remove([media.storage_path])
  }

  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}

/* ------------------------------------------------------ Qualification ---- */

export async function saveQualification(input: unknown): Promise<Result> {
  const profile = await editorOrNull('orders')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = qualificationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data

  if (v.customer_signed_off && !v.signed_off_on) {
    return {
      ok: false,
      error: 'A sign-off needs the date it was signed.',
      fieldErrors: { signed_off_on: 'When was it signed?' },
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('qualifications').upsert(
    {
      order_id: v.order_id,
      stage: v.stage,
      status: v.status,
      planned_date: v.planned_date || null,
      performed_on: v.performed_on || null,
      performed_by: profile.id,
      customer_representative: blank(v.customer_representative),
      customer_signed_off: v.customer_signed_off,
      signed_off_on: v.signed_off_on || null,
      summary: blank(v.summary),
      notes: blank(v.notes),
      created_by: profile.id,
    },
    { onConflict: 'order_id,stage' }
  )

  if (error) return { ok: false, error: 'Could not save that stage.' }

  revalidatePath(`/orders/${v.order_id}`)
  return { ok: true }
}

/** Turns the qualification section on or off for an order. */
export async function setRequiresQualification(
  orderId: string,
  required: boolean
): Promise<Result> {
  if (!(await editorOrNull('orders'))) return NO_FEATURE_ACCESS
  if (!uuid.safeParse(orderId).success) return { ok: false, error: 'Unrecognised order.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ requires_qualification: required })
    .eq('id', orderId)
  if (error) return { ok: false, error: 'Could not change that.' }
  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}

/* ----------------------------------------------------------- Meetings ---- */

export async function saveMeeting(input: unknown): Promise<Result> {
  const profile = await editorOrNull('meetings')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = meetingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const fields = {
    meeting_date: v.meeting_date,
    meeting_type: v.meeting_type,
    subject: v.subject,
    location: blank(v.location),
    company_id: v.company_id || null,
    inquiry_id: v.inquiry_id || null,
    order_id: v.order_id || null,
    internal_attendees: toList(v.internal_attendees),
    client_attendees: toList(v.client_attendees),
    agenda: blank(v.agenda),
    discussion: blank(v.discussion),
    decisions: blank(v.decisions),
    next_steps: blank(v.next_steps),
  }

  if (v.id) {
    const { error } = await supabase.from('meetings').update(fields).eq('id', v.id)
    if (error) return { ok: false, error: 'Could not save the minutes.' }
    revalidatePath(`/meetings/${v.id}`)
    revalidatePath('/meetings')
    return { ok: true, id: v.id }
  }

  const { data, error } = await supabase
    .from('meetings')
    .insert({ ...fields, created_by: profile.id })
    .select('id')
    .single()

  if (error) return { ok: false, error: 'Could not save the minutes.' }

  revalidatePath('/meetings')
  if (fields.order_id) revalidatePath(`/orders/${fields.order_id}`)
  return { ok: true, id: data.id }
}

/**
 * An action item with an owner and a due date becomes a follow-up, so it
 * lands on the dashboard alarm panel. That happens in the database, not here
 * — the two cannot drift apart, and closing the action closes the follow-up.
 */
export async function saveMeetingAction(input: unknown): Promise<Result> {
  if (!(await editorOrNull('meetings'))) return NO_FEATURE_ACCESS

  const parsed = meetingActionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message, fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const fields = {
    action: v.action,
    owner_id: v.owner_id || null,
    due_on: v.due_on || null,
    is_done: v.is_done,
    done_at: v.is_done ? new Date().toISOString() : null,
  }

  const { error } = v.id
    ? await supabase.from('meeting_actions').update(fields).eq('id', v.id)
    : await supabase.from('meeting_actions').insert({ ...fields, meeting_id: v.meeting_id })

  if (error) return { ok: false, error: 'Could not save that action.' }

  revalidatePath(`/meetings/${v.meeting_id}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteMeetingAction(actionId: string, meetingId: string): Promise<Result> {
  if (!(await editorOrNull('meetings'))) return NO_FEATURE_ACCESS
  if (!uuid.safeParse(actionId).success) return { ok: false, error: 'Unrecognised action.' }
  const supabase = await createClient()
  const { error } = await supabase.from('meeting_actions').delete().eq('id', actionId)
  if (error) return { ok: false, error: 'Could not remove that action.' }
  revalidatePath(`/meetings/${meetingId}`)
  return { ok: true }
}
