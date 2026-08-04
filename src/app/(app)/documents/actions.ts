'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { companySettingsSchema, createDocumentSchema } from '@/lib/schemas/document'
import { GST_STATES } from '@/lib/constants'

export type Result =
  | { ok: true; id?: string; docNo?: string }
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
 * The database raises its own errors for anything it refuses — incomplete
 * settings, a missing HSN code, a tax invoice for a client outside GST. Those
 * messages are written for staff to read, so they are passed through rather
 * than replaced with something vaguer.
 */
function dbMessage(message: string, fallback: string): string {
  const cleaned = message.replace(/^ERROR:\s*/i, '').trim()
  return cleaned.length > 0 && cleaned.length < 300 ? cleaned : fallback
}

/** Saves the supplier's own details. Admin only, enforced by RLS as well. */
export async function saveCompanySettings(input: unknown): Promise<Result> {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can change the company details.' }
  }

  const parsed = companySettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const blank = (value: string | undefined) => (value && value.trim() !== '' ? value.trim() : null)

  const { data: existing } = await supabase.from('company_settings').select('id').limit(1).single()

  const { error } = await supabase
    .from('company_settings')
    .update({
      legal_name: blank(v.legal_name),
      trade_name: blank(v.trade_name),
      address_line1: blank(v.address_line1),
      address_line2: blank(v.address_line2),
      city: blank(v.city),
      state_name: blank(v.state_name) ?? (v.state_code ? GST_STATES[v.state_code] : null),
      state_code: blank(v.state_code),
      pincode: blank(v.pincode),
      gstin: blank(v.gstin),
      pan: blank(v.pan),
      phone: blank(v.phone),
      email: blank(v.email),
      website: blank(v.website),
      bank_name: blank(v.bank_name),
      bank_account_no: blank(v.bank_account_no),
      bank_ifsc: blank(v.bank_ifsc),
      bank_branch: blank(v.bank_branch),
      signatory_name: blank(v.signatory_name),
      signatory_designation: blank(v.signatory_designation),
      default_gst_rate: v.default_gst_rate,
      invoice_terms: blank(v.invoice_terms),
    })
    .eq('id', existing!.id)

  if (error) return { ok: false, error: dbMessage(error.message, 'Could not save those details.') }

  revalidatePath('/settings')
  revalidatePath('/documents')
  return { ok: true }
}

/**
 * Raises a draft document from an order.
 *
 * The lines are copied from the order by the database, not by this action —
 * so what appears on the document is exactly what the order says at that
 * moment, and the copy cannot drift from the original.
 */
export async function createDocument(input: unknown): Promise<Result> {
  await requireProfile()

  const parsed = createDocumentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_document', {
    p_order_id: v.order_id,
    p_doc_type: v.doc_type,
    p_doc_date: v.doc_date,
    p_place_of_supply_code: v.place_of_supply_code || null,
    p_place_of_supply_name: v.place_of_supply_code ? (GST_STATES[v.place_of_supply_code] ?? null) : null,
    p_parent_invoice_id: v.parent_invoice_id || null,
    p_notes: v.notes || null,
    p_reason: v.reason || null,
  })

  if (error) return { ok: false, error: dbMessage(error.message, 'Could not raise that document.') }

  revalidatePath('/documents')
  revalidatePath(`/orders/${v.order_id}`)
  return { ok: true, id: data as string }
}

/**
 * Issues a draft: the database allocates the number and freezes the supplier
 * and buyer details onto the document. After this it cannot be changed.
 */
export async function issueDocument(invoiceId: string): Promise<Result> {
  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('issue_document', { p_invoice_id: invoiceId })

  if (error) {
    return {
      ok: false,
      error: dbMessage(error.message, 'Could not issue that document.'),
    }
  }

  revalidatePath('/documents')
  revalidatePath(`/documents/${invoiceId}`)
  return { ok: true, docNo: data as string }
}

export async function cancelDocument(invoiceId: string, reason: string): Promise<Result> {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can cancel a document.' }
  }
  if (reason.trim().length < 3) {
    return { ok: false, error: 'A reason is required to cancel a document.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_document', {
    p_invoice_id: invoiceId,
    p_reason: reason.trim(),
  })

  if (error) return { ok: false, error: dbMessage(error.message, 'Could not cancel that document.') }

  revalidatePath('/documents')
  revalidatePath(`/documents/${invoiceId}`)
  return { ok: true }
}

/** Deletes a draft. An issued document can only be cancelled, never removed. */
export async function deleteDraft(invoiceId: string): Promise<Result> {
  const profile = await requireProfile()
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can delete a draft.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId).eq('status', 'draft')

  if (error) return { ok: false, error: 'Could not delete that draft.' }

  revalidatePath('/documents')
  return { ok: true }
}
