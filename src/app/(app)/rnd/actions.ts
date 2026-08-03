'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { rndExpenseSchema, rndProjectSchema } from '@/lib/schemas/rnd'

export type RndResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export type SimpleResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export async function createRndProject(input: unknown): Promise<RndResult> {
  const profile = await requireProfile()

  const parsed = rndProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  // spent_to_date is deliberately absent: it is maintained by the expense
  // ledger trigger and must never be set from the app.
  const { data, error } = await supabase
    .from('rnd_projects')
    .insert({
      project_code: values.project_code || null,
      project_name: values.project_name,
      description: values.description ?? null,
      approx_budget: values.approx_budget ?? null,
      start_date: values.start_date || null,
      target_date: values.target_date || null,
      actual_end_date: values.actual_end_date || null,
      stage: values.stage,
      lead_id: values.lead_id ?? profile.id,
      notes: values.notes ?? null,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    const duplicate = error?.code === '23505'
    return {
      ok: false,
      error: duplicate ? 'That project code is already in use.' : 'Could not create the project.',
    }
  }

  revalidatePath('/rnd')
  return { ok: true, id: data.id }
}

export async function updateRndProject(id: string, input: unknown): Promise<RndResult> {
  await requireProfile()

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: 'Unrecognised project.' }
  }

  const parsed = rndProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('rnd_projects')
    .update({
      project_code: values.project_code || null,
      project_name: values.project_name,
      description: values.description ?? null,
      approx_budget: values.approx_budget ?? null,
      start_date: values.start_date || null,
      target_date: values.target_date || null,
      actual_end_date: values.actual_end_date || null,
      stage: values.stage,
      lead_id: values.lead_id ?? null,
      notes: values.notes ?? null,
    })
    .eq('id', id)

  if (error) {
    const duplicate = error.code === '23505'
    return {
      ok: false,
      error: duplicate ? 'That project code is already in use.' : 'Could not save your changes.',
    }
  }

  revalidatePath('/rnd')
  revalidatePath(`/rnd/${id}`)
  return { ok: true, id }
}

/**
 * Adds a line of spend. `rnd_projects.spent_to_date` is recalculated by the
 * `recalc_project_spend()` trigger as the sum of the project's live expenses,
 * so budget-vs-spent can never drift from what was actually recorded.
 */
export async function addRndExpense(input: unknown): Promise<SimpleResult> {
  const profile = await requireProfile()

  const parsed = rndExpenseSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('rnd_expenses').insert({
    project_id: values.project_id,
    amount: values.amount,
    spent_on: values.spent_on,
    kind: values.kind,
    description: values.description,
    vendor: values.vendor ?? null,
    reference: values.reference ?? null,
    created_by: profile.id,
  })

  if (error) return { ok: false, error: 'Could not record the expense.' }

  revalidatePath(`/rnd/${values.project_id}`)
  revalidatePath('/rnd')
  return { ok: true }
}

/**
 * Soft-deletes an expense. `guard_soft_delete()` rejects this for non-admins
 * at the database level; the check here exists to give a clear message.
 */
export async function removeRndExpense(
  expenseId: string,
  projectId: string
): Promise<SimpleResult> {
  const profile = await requireProfile()

  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can remove an expense.' }
  }
  if (!z.string().uuid().safeParse(expenseId).success) {
    return { ok: false, error: 'Unrecognised expense.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('rnd_expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId)

  if (error) return { ok: false, error: 'Could not remove the expense.' }

  revalidatePath(`/rnd/${projectId}`)
  revalidatePath('/rnd')
  return { ok: true }
}
