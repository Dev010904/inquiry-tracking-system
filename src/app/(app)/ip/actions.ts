'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ipAssetSchema, ipEventSchema } from '@/lib/schemas/ip'

export type IpResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export type IpSimpleResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** "A Sharma, B Patel" -> ['A Sharma', 'B Patel']. Postgres column is text[]. */
function splitInventors(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

export async function createIpAsset(input: unknown): Promise<IpResult> {
  const profile = await requireProfile()

  const parsed = ipAssetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  // cost_to_date is absent on purpose — it is summed from ip_events by trigger.
  const { data, error } = await supabase
    .from('ip_assets')
    .insert({
      title: v.title,
      ip_type: v.ip_type,
      status: v.status,
      protection_route: v.protection_route || null,
      jurisdiction: v.jurisdiction,
      application_no: v.application_no ?? null,
      registration_no: v.registration_no ?? null,
      rnd_project_id: v.rnd_project_id || null,
      filing_date: v.filing_date || null,
      publication_date: v.publication_date || null,
      grant_date: v.grant_date || null,
      expiry_date: v.expiry_date || null,
      next_renewal_date: v.next_renewal_date || null,
      inventors: splitInventors(v.inventors),
      owner_entity: v.owner_entity ?? null,
      attorney_firm: v.attorney_firm ?? null,
      attorney_contact: v.attorney_contact ?? null,
      confidentiality: v.confidentiality,
      notes: v.notes ?? null,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: 'Could not create the IP asset.' }

  revalidatePath('/ip')
  revalidatePath('/dashboard')
  return { ok: true, id: data.id }
}

export async function updateIpAsset(id: string, input: unknown): Promise<IpResult> {
  await requireProfile()

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: 'Unrecognised asset.' }
  }

  const parsed = ipAssetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('ip_assets')
    .update({
      title: v.title,
      ip_type: v.ip_type,
      status: v.status,
      protection_route: v.protection_route || null,
      jurisdiction: v.jurisdiction,
      application_no: v.application_no ?? null,
      registration_no: v.registration_no ?? null,
      rnd_project_id: v.rnd_project_id || null,
      filing_date: v.filing_date || null,
      publication_date: v.publication_date || null,
      grant_date: v.grant_date || null,
      expiry_date: v.expiry_date || null,
      next_renewal_date: v.next_renewal_date || null,
      inventors: splitInventors(v.inventors),
      owner_entity: v.owner_entity ?? null,
      attorney_firm: v.attorney_firm ?? null,
      attorney_contact: v.attorney_contact ?? null,
      confidentiality: v.confidentiality,
      notes: v.notes ?? null,
    })
    .eq('id', id)

  if (error) return { ok: false, error: 'Could not save your changes.' }

  revalidatePath('/ip')
  revalidatePath(`/ip/${id}`)
  revalidatePath('/dashboard')
  return { ok: true, id }
}

/**
 * Records an event. Any `cost` is rolled into `ip_assets.cost_to_date` by
 * trigger, and a `due_date` puts the asset on the dashboard alarm panel at
 * 90, 30 and 7 days out.
 */
export async function addIpEvent(input: unknown): Promise<IpSimpleResult> {
  const profile = await requireProfile()

  const parsed = ipEventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const v = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('ip_events').insert({
    ip_asset_id: v.ip_asset_id,
    event_date: v.event_date,
    event_type: v.event_type,
    due_date: v.due_date || null,
    cost: v.cost ?? null,
    note: v.note ?? null,
    author_id: profile.id,
  })

  if (error) return { ok: false, error: 'Could not record the event.' }

  revalidatePath(`/ip/${v.ip_asset_id}`)
  revalidatePath('/ip')
  revalidatePath('/dashboard')
  return { ok: true }
}
