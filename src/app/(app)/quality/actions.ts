'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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
  const profile = await requireProfile()

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

/**
 * Records a piece of evidence.
 *
 * Photos are uploaded to a private bucket by the browser before this runs —
 * the file is compressed client-side, so what arrives is already small.
 * Videos are stored as links, which keeps the free storage tier viable.
 */
export async function addQaMedia(input: unknown, orderId: string): Promise<Result> {
  const profile = await requireProfile()

  const parsed = qaMediaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message, fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('qa_media').insert({
    qa_check_id: v.qa_check_id,
    kind: v.kind,
    storage_path: blank(v.storage_path),
    external_url: blank(v.external_url),
    caption: blank(v.caption),
    uploaded_by: profile.id,
  })

  if (error) return { ok: false, error: 'Could not attach that evidence.' }

  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}

export async function removeQaMedia(mediaId: string, orderId: string): Promise<Result> {
  await requireProfile()
  const supabase = await createClient()
  const { error } = await supabase.from('qa_media').delete().eq('id', mediaId)
  if (error) return { ok: false, error: 'Could not remove that.' }
  revalidatePath(`/orders/${orderId}`)
  return { ok: true }
}

/* ------------------------------------------------------ Qualification ---- */

export async function saveQualification(input: unknown): Promise<Result> {
  const profile = await requireProfile()

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
  await requireProfile()
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
  const profile = await requireProfile()

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
  await requireProfile()

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
  await requireProfile()
  const supabase = await createClient()
  const { error } = await supabase.from('meeting_actions').delete().eq('id', actionId)
  if (error) return { ok: false, error: 'Could not remove that action.' }
  revalidatePath(`/meetings/${meetingId}`)
  return { ok: true }
}
