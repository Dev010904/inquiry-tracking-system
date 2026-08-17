'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getCompanyContacts } from '@/lib/queries/inquiries'
import { CONVERTIBLE_STATUSES, CONVERTIBLE_STATUS_LABEL } from '@/lib/constants'
import {
  convertToOrderSchema,
  inquirySchema,
  type InquiryInput,
} from '@/lib/schemas/inquiry'

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/**
 * Creates the inquiry, plus a company and contact if the user added them
 * inline, plus the first follow-up.
 *
 * PostgREST has no multi-statement transaction, so this runs as a sequence.
 * The order is deliberate — company, then contact, then inquiry, then
 * follow-up — so that a failure part-way leaves behind only orphaned
 * reference data (a company with no inquiry), never an inquiry pointing at a
 * company that does not exist.
 */
export async function createInquiry(input: InquiryInput): Promise<SaveResult> {
  const profile = await editorOrNull('inquiries')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = inquirySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  let companyId = values.company_id
  if (values.new_company) {
    const { data, error } = await supabase
      .from('companies')
      .insert({
        name: values.new_company.name,
        type: values.new_company.type,
        city: values.new_company.city ?? null,
        state: values.new_company.state ?? null,
        created_by: profile.id,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: 'Could not save the new company.' }
    companyId = data.id
  }
  if (!companyId) return { ok: false, error: 'No company selected.' }

  let contactId = values.contact_id
  if (values.new_contact) {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        company_id: companyId,
        name: values.new_contact.name,
        phone: values.new_contact.phone || null,
        email: values.new_contact.email || null,
        designation: values.new_contact.designation ?? null,
        created_by: profile.id,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: 'Could not save the new contact.' }
    contactId = data.id
  }

  const { data: inquiry, error } = await supabase
    .from('inquiries')
    .insert({
      inquiry_date: values.inquiry_date,
      company_id: companyId,
      contact_id: contactId ?? null,
      source: values.source ?? null,
      requirement_summary: values.requirement_summary,
      estimated_value: values.estimated_value ?? null,
      currency: values.currency,
      status: values.status,
      priority: values.priority,
      owner_id: values.owner_id ?? profile.id,
      lost_reason: values.lost_reason ?? null,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error || !inquiry) return { ok: false, error: 'Could not save the inquiry.' }

  if (values.followup_due) {
    // A failed follow-up must not lose the inquiry the user just typed, so
    // this is reported as a warning path rather than rolled back.
    await supabase.from('followups').insert({
      inquiry_id: inquiry.id,
      due_at: new Date(values.followup_due).toISOString(),
      channel: values.followup_channel,
      note: values.followup_note || 'Follow up on this inquiry',
      assigned_to: values.owner_id ?? profile.id,
      created_by: profile.id,
    })
  }

  revalidatePath('/inquiries')
  revalidatePath('/dashboard')
  return { ok: true, id: inquiry.id }
}

export async function updateInquiry(id: string, input: InquiryInput): Promise<SaveResult> {
  if (!(await editorOrNull('inquiries'))) return NO_FEATURE_ACCESS

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: 'Unrecognised inquiry.' }
  }

  const parsed = inquirySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  // Editing never creates a company — that path only exists on the new form,
  // where there is no existing record to accidentally repoint.
  if (!values.company_id) return { ok: false, error: 'Pick an existing company.' }

  let contactId = values.contact_id
  if (values.new_contact) {
    const { data } = await supabase
      .from('contacts')
      .insert({
        company_id: values.company_id,
        name: values.new_contact.name,
        phone: values.new_contact.phone || null,
        email: values.new_contact.email || null,
        designation: values.new_contact.designation ?? null,
      })
      .select('id')
      .single()
    contactId = data?.id ?? contactId
  }

  const { error } = await supabase
    .from('inquiries')
    .update({
      inquiry_date: values.inquiry_date,
      company_id: values.company_id,
      contact_id: contactId ?? null,
      source: values.source ?? null,
      requirement_summary: values.requirement_summary,
      estimated_value: values.estimated_value ?? null,
      currency: values.currency,
      status: values.status,
      priority: values.priority,
      owner_id: values.owner_id ?? null,
      lost_reason: values.status === 'lost' ? (values.lost_reason ?? null) : null,
    })
    .eq('id', id)

  if (error) return { ok: false, error: 'Could not save your changes.' }

  revalidatePath('/inquiries')
  revalidatePath(`/inquiries/${id}`)
  revalidatePath('/dashboard')
  return { ok: true, id }
}

const followupSchema = z.object({
  inquiry_id: z.string().uuid(),
  due_at: z.string().min(1, 'Pick a date'),
  channel: z.enum(['call', 'email', 'whatsapp', 'visit', 'other']),
  note: z.string().trim().min(1, 'Add a note').max(500),
})

/** Schedules another follow-up from the inquiry detail screen. */
export async function addFollowup(
  input: z.input<typeof followupSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await editorOrNull('inquiries')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = followupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }

  const supabase = await createClient()
  const { error } = await supabase.from('followups').insert({
    inquiry_id: parsed.data.inquiry_id,
    due_at: new Date(parsed.data.due_at).toISOString(),
    channel: parsed.data.channel,
    note: parsed.data.note,
    assigned_to: profile.id,
    created_by: profile.id,
  })

  if (error) return { ok: false, error: 'Could not schedule the follow-up.' }

  revalidatePath(`/inquiries/${parsed.data.inquiry_id}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Converts a quoted or negotiating inquiry into a confirmed order.
 *
 * The order is inserted first. `orders.inquiry_id` is unique, so a double
 * submit or a stale tab cannot produce two orders for one inquiry — the
 * second insert fails on the constraint rather than on a check we wrote.
 * Only once the order exists does the inquiry flip to `confirmed`, so the
 * failure mode is "order exists, status still says quoted", which is visible
 * and fixable, rather than a confirmed inquiry with no order behind it.
 */
export async function convertToOrder(
  input: z.input<typeof convertToOrderSchema>
): Promise<SaveResult> {
  const profile = await editorOrNull('inquiries')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = convertToOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('id, status, currency')
    .eq('id', values.inquiry_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!inquiry) return { ok: false, error: 'That inquiry no longer exists.' }

  // Re-checked server-side: the button being disabled in the UI is a courtesy,
  // not a control.
  if (!CONVERTIBLE_STATUSES.includes(inquiry.status)) {
    return {
      ok: false,
      error: `Only inquiries at ${CONVERTIBLE_STATUS_LABEL} can be converted to an order.`,
    }
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      inquiry_id: values.inquiry_id,
      order_date: values.order_date,
      order_value: values.order_value,
      // Inherited, never re-chosen. An order in a different currency from the
      // inquiry it came off would be a data-entry slip, not a business case.
      currency: inquiry.currency,
      delivery_date: values.delivery_date || null,
      po_number: values.po_number ?? null,
      technical_specification: values.technical_specification,
      addendum: values.addendum ?? null,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (orderError || !order) {
    const duplicate = orderError?.code === '23505'
    return {
      ok: false,
      error: duplicate
        ? 'An order already exists for this inquiry.'
        : 'Could not create the order.',
    }
  }

  const { error: statusError } = await supabase
    .from('inquiries')
    .update({ status: 'confirmed' })
    .eq('id', values.inquiry_id)

  if (statusError) {
    return {
      ok: false,
      error:
        'The order was created but the inquiry status did not update. Set it to Confirmed manually.',
    }
  }

  revalidatePath('/inquiries')
  revalidatePath(`/inquiries/${values.inquiry_id}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  return { ok: true, id: order.id }
}

/**
 * Contacts for the picker when the chosen company changes.
 *
 * Returns an empty list rather than an error when the role withholds
 * Inquiries: the only caller is the inquiry form, which such a user cannot
 * reach, and an empty picker leaks nothing about who the client's people are.
 */
export async function fetchCompanyContacts(companyId: string) {
  if (!(await editorOrNull('inquiries'))) return []
  if (!z.string().uuid().safeParse(companyId).success) return []
  return getCompanyContacts(companyId)
}
