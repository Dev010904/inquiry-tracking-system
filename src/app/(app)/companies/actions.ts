'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { gstStateFor } from '@/lib/constants'
import { companySchema, contactSchema } from '@/lib/schemas/company'

export type CompanyResult =
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

const idSchema = z.string().uuid()

/**
 * Edits a client.
 *
 * Deliberately no create: a company is born on the inquiry screen, where it
 * arrives attached to the work that justified it. This screen exists because
 * that inline form captures four columns and an invoice needs nine.
 *
 * Nothing here can reach a document that has already gone out. Every issued
 * document carries `buyer_snapshot`, written by `create_document()` at issue
 * time, and the printed layout reads the snapshot rather than the live row.
 */
export async function updateCompany(id: string, input: unknown): Promise<CompanyResult> {
  if (!(await editorOrNull('companies'))) return NO_FEATURE_ACCESS

  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Unrecognised client.' }

  const parsed = companySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  // With a GSTIN present the schema has already established that the typed
  // state agrees with it, so taking the canonical spelling here only settles
  // case and punctuation — and fills the column when it was left blank.
  const derived = gstStateFor(v.gstin)

  const { error } = await supabase
    .from('companies')
    .update({
      name: v.name,
      type: v.type,
      address: v.address || null,
      city: v.city || null,
      state: derived?.name ?? (v.state || null),
      gstin: v.gstin || null,
      gst_applicable: v.gst_applicable,
      // Cleared when GST does apply, so a reason left over from an earlier
      // exemption cannot sit on the record contradicting the switch above it.
      gst_exemption_reason: v.gst_applicable ? null : v.gst_exemption_reason || null,
      notes: v.notes || null,
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { ok: false, error: 'Could not save the client.' }

  revalidatePath('/companies')
  revalidatePath(`/companies/${id}`)
  return { ok: true, id }
}

export type ContactResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

/**
 * Adds a contact, or edits one — `contactId` null means add.
 *
 * Contacts were in the same position as companies: created inline on the
 * inquiry form and then frozen. A person changes job title and phone number
 * far more often than their employer changes GSTIN.
 */
export async function saveContact(
  companyId: string,
  contactId: string | null,
  input: unknown
): Promise<ContactResult> {
  const profile = await editorOrNull('companies')
  if (!profile) return NO_FEATURE_ACCESS

  if (!idSchema.safeParse(companyId).success) return { ok: false, error: 'Unrecognised client.' }
  if (contactId !== null && !idSchema.safeParse(contactId).success) {
    return { ok: false, error: 'Unrecognised contact.' }
  }

  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const row = {
    company_id: companyId,
    name: v.name,
    designation: v.designation || null,
    phone: v.phone || null,
    email: v.email || null,
    is_primary: v.is_primary,
  }

  // Primary is one per client, and the column carries no unique index. Demote
  // the others first: two primaries would make the contact printed on a
  // document depend on row order, which is not a decision anyone made.
  if (v.is_primary) {
    let demote = supabase
      .from('contacts')
      .update({ is_primary: false })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    if (contactId) demote = demote.neq('id', contactId)
    await demote
  }

  const { error } = contactId
    ? await supabase.from('contacts').update(row).eq('id', contactId).is('deleted_at', null)
    : await supabase.from('contacts').insert({ ...row, created_by: profile.id })

  if (error) return { ok: false, error: contactId ? 'Could not save the contact.' : 'Could not add the contact.' }

  revalidatePath('/companies')
  revalidatePath(`/companies/${companyId}`)
  return { ok: true }
}
