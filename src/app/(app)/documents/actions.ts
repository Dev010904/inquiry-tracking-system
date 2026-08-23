'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { settingsManagerOrNull } from '@/lib/auth'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { dbMessage } from '@/lib/db-message'
import {
  companySettingsSchema,
  createDocumentSchema,
  documentTermsSchema,
} from '@/lib/schemas/document'
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
/** Saves the supplier's own details. Admin only, enforced by RLS as well. */
export async function saveCompanySettings(input: unknown): Promise<Result> {
  // Lives here rather than in settings/actions.ts, but it is a settings write
  // and carries the settings gate. The company_settings RLS policy requires the
  // same flag, so this only decides which error the user sees.
  const profile = await settingsManagerOrNull()
  if (!profile) {
    return { ok: false, error: 'You cannot change the company details.' }
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
      default_currency: v.default_currency,
      invoice_terms: blank(v.invoice_terms),
      msme_no: blank(v.msme_no),
      jurisdiction_city: blank(v.jurisdiction_city),
      payment_terms: blank(v.payment_terms),
      delivery_timeline: blank(v.delivery_timeline),
      quotation_terms: blank(v.quotation_terms),
      print_supplier_header: v.print_supplier_header,
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
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS

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
    p_valid_days: v.valid_days,
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
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS
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
  const profile = await editorOrNull('documents')
  if (!profile) return NO_FEATURE_ACCESS
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
  const profile = await editorOrNull('documents')
  if (!profile) return NO_FEATURE_ACCESS
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can delete a draft.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId).eq('status', 'draft')

  if (error) return { ok: false, error: 'Could not delete that draft.' }

  revalidatePath('/documents')
  return { ok: true }
}

/**
 * Rewrites the whole terms block on a draft — validity, payment terms,
 * delivery, installation scope and the visit charge.
 *
 * One call rather than one per field. These are read together on the printed
 * sheet and negotiated together on the phone, and saving them one at a time
 * would let a network drop leave the document quoting the new rate against the
 * old number of visits.
 *
 * The database refuses once the document is issued, whatever this action does.
 */
export async function setDocumentTerms(input: unknown): Promise<Result> {
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS

  const parsed = documentTermsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_document_terms', {
    p_invoice_id: v.invoice_id,
    p_valid_days: v.valid_days,
    p_payment_terms: v.payment_terms || null,
    p_delivery_timeline: v.delivery_timeline || null,
    p_installation_scope: v.installation_scope || null,
    p_visit_rate: v.visit_rate,
    p_visit_count: v.visit_count,
  })

  if (error) return { ok: false, error: dbMessage(error.message, 'Could not save those terms.') }

  revalidatePath(`/documents/${v.invoice_id}`)
  return { ok: true }
}

/**
 * Adds a scope to the site-installation dropdown, from the document screen.
 *
 * The list is the owner's rather than ours, and the moment he needs a new entry
 * is the moment he is halfway through writing a quotation. Sending him to a
 * settings page to add it, and back again, is how a dropdown ends up with one
 * option called "Other".
 */
export async function addInstallationOption(label: string): Promise<Result> {
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS

  const clean = label.trim()
  if (clean.length < 2) {
    return { ok: false, error: 'Type the installation scope before adding it.' }
  }
  if (clean.length > 200) {
    return { ok: false, error: 'That is too long for a dropdown entry.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_installation_option', { p_label: clean })

  if (error) return { ok: false, error: dbMessage(error.message, 'Could not add that option.') }

  revalidatePath('/documents')
  return { ok: true }
}

/**
 * Raises a new draft pre-filled from an existing document.
 *
 * This is the answer to "let me edit an invoice I have already issued". An
 * issued invoice is a statutory record and cannot be rewritten, but the thing
 * behind the request — something was wrong, so send a corrected one quickly —
 * is served by duplicating it, fixing the copy, and crediting the original.
 *
 * The copy is always a draft: no number, no snapshots, no issue history.
 */
export async function duplicateDocument(invoiceId: string): Promise<Result> {
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('duplicate_document', {
    p_invoice_id: invoiceId,
  })

  if (error) {
    return { ok: false, error: dbMessage(error.message, 'Could not duplicate that document.') }
  }

  revalidatePath('/documents')
  return { ok: true, id: data as string }
}

const quotationSchema = z.object({
  inquiry_id: z.string().uuid(),
  doc_date: z.string().min(1, 'Pick a date'),
  place_of_supply_code: z.string().trim().max(2).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  // A quotation is a price with an expiry, so validity is asked for up front
  // here rather than left to the draft screen.
  valid_days: z.coerce.number().int().min(0).max(365).default(15),
})

/**
 * Raises a draft quotation against an inquiry.
 *
 * It starts with no lines: a quotation goes out before anything is confirmed,
 * so there is no order to copy from. The lines are typed on the draft, and
 * accepting the quotation later carries them into the order.
 */
export async function createQuotation(input: unknown): Promise<Result> {
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS

  const parsed = quotationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_quotation', {
    p_inquiry_id: v.inquiry_id,
    p_doc_date: v.doc_date,
    p_place_of_supply_code: v.place_of_supply_code || null,
    p_place_of_supply_name: v.place_of_supply_code
      ? (GST_STATES[v.place_of_supply_code] ?? null)
      : null,
    p_notes: v.notes || null,
    p_valid_days: v.valid_days,
  })

  if (error) return { ok: false, error: dbMessage(error.message, 'Could not raise that quotation.') }

  revalidatePath('/documents')
  revalidatePath(`/inquiries/${v.inquiry_id}`)
  return { ok: true, id: data as string }
}

const documentLineSchema = z.object({
  id: z.string().uuid().optional(),
  invoice_id: z.string().uuid(),
  description: z.string().trim().min(3, 'Describe what is being supplied').max(500),
  hsn_sac: z
    .string()
    .trim()
    .max(10)
    .regex(/^\d*$/, 'HSN/SAC codes are digits only')
    .optional()
    .or(z.literal('')),
  quantity: z.coerce.number().positive('Quantity must be more than zero').max(9_999_999),
  unit: z.enum(['nos', 'set', 'kg', 'm', 'hour', 'lot']),
  rate: z.coerce.number().min(0, 'Rate cannot be negative').max(99_999_999),
  gst_rate: z.coerce.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100%'),
  zero_rate_reason: z.string().trim().max(300).optional().or(z.literal('')),
})

/**
 * Adds or edits a line on a draft document.
 *
 * `taxable_value` and `line_total` are written here as quantity x rate, and
 * then immediately recalculated by Postgres along with the tax — the values
 * sent from the browser are a starting point the database overwrites, never
 * the figures that end up on the document.
 *
 * The draft-only rule is enforced by the `invoice_lines_write` policy and by
 * `guard_issued_document_lines()`, not by this action. An issued document
 * cannot be edited even by a request that skips this code path entirely.
 */
export async function saveDocumentLine(input: unknown): Promise<Result> {
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS

  const parsed = documentLineSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const amount = Math.round(v.quantity * v.rate * 100) / 100
  const fields = {
    description: v.description,
    hsn_sac: v.hsn_sac || null,
    quantity: v.quantity,
    unit: v.unit,
    rate: v.rate,
    taxable_value: amount,
    line_total: amount,
    gst_rate: v.gst_rate,
    zero_rate_reason: v.zero_rate_reason || null,
  }

  if (v.id) {
    const { error } = await supabase.from('invoice_lines').update(fields).eq('id', v.id)
    if (error) return { ok: false, error: dbMessage(error.message, 'Could not save that line.') }
  } else {
    const { data: last } = await supabase
      .from('invoice_lines')
      .select('line_no')
      .eq('invoice_id', v.invoice_id)
      .order('line_no', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await supabase
      .from('invoice_lines')
      .insert({ ...fields, invoice_id: v.invoice_id, line_no: (last?.line_no ?? 0) + 1 })
    if (error) return { ok: false, error: dbMessage(error.message, 'Could not add that line.') }
  }

  const { error: recalcError } = await supabase.rpc('refresh_document_totals', {
    p_invoice_id: v.invoice_id,
  })
  if (recalcError) {
    return { ok: false, error: dbMessage(recalcError.message, 'Line saved, but the totals did not update.') }
  }

  revalidatePath(`/documents/${v.invoice_id}`)
  return { ok: true }
}

/** Removes a line from a draft and recalculates what is left. */
export async function removeDocumentLine(lineId: string, invoiceId: string): Promise<Result> {
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS
  const supabase = await createClient()

  const { error } = await supabase.from('invoice_lines').delete().eq('id', lineId)
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not remove that line.') }

  const { error: recalcError } = await supabase.rpc('refresh_document_totals', {
    p_invoice_id: invoiceId,
  })
  if (recalcError) {
    return { ok: false, error: dbMessage(recalcError.message, 'Line removed, but the totals did not update.') }
  }

  revalidatePath(`/documents/${invoiceId}`)
  return { ok: true }
}

/**
 * Turns an accepted quotation into an order, carrying its lines across.
 *
 * The order is created by the database in one call so the lines cannot arrive
 * without the order, and the inquiry cannot be marked confirmed without both.
 */
export async function acceptQuotation(
  quotationId: string,
  technicalSpecification: string
): Promise<Result> {
  if (!(await editorOrNull('documents'))) return NO_FEATURE_ACCESS

  const spec = technicalSpecification.trim()
  if (spec.length < 3) {
    return { ok: false, error: 'Describe what is being supplied before creating the order.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_quotation', {
    p_quotation_id: quotationId,
    p_technical_specification: spec,
  })

  if (error) return { ok: false, error: dbMessage(error.message, 'Could not accept that quotation.') }

  revalidatePath('/orders')
  revalidatePath('/documents')
  revalidatePath(`/documents/${quotationId}`)
  return { ok: true, id: data as string }
}
