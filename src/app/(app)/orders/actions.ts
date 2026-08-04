'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { orderDetailsSchema, paymentSchema } from '@/lib/schemas/order'

export type Result =
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

/**
 * Records a payment.
 *
 * This inserts into the ledger and nothing else. `orders.advance_received` is
 * recalculated by a database trigger as the SUM of the order's payments, and
 * `balance_pending` is a generated column derived from that — so the balance
 * cannot drift from the ledger even if a payment is later edited or removed.
 */
export async function addPayment(input: unknown): Promise<Result> {
  const profile = await requireProfile()

  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  // Existence check only. A payment larger than the outstanding balance is
  // deliberately allowed — rounding, advances against future work and
  // corrections are all legitimate, and refusing them would push staff into
  // recording nothing at all. The UI warns; the database does not block.
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', values.order_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!order) return { ok: false, error: 'That order no longer exists.' }

  const { error } = await supabase.from('payments').insert({
    order_id: values.order_id,
    amount: values.amount,
    paid_on: values.paid_on,
    mode: values.mode,
    reference: values.reference ?? null,
    note: values.note ?? null,
    created_by: profile.id,
  })

  if (error) return { ok: false, error: 'Could not record the payment.' }

  revalidatePath(`/orders/${values.order_id}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Soft-deletes a payment. `guard_soft_delete()` in the database rejects this
 * for non-admins, so the role check here is about giving a clear message
 * rather than about enforcement.
 */
export async function removePayment(paymentId: string, orderId: string): Promise<Result> {
  const profile = await requireProfile()

  if (profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin can remove a payment.' }
  }
  if (!z.string().uuid().safeParse(paymentId).success) {
    return { ok: false, error: 'Unrecognised payment.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', paymentId)

  if (error) return { ok: false, error: 'Could not remove the payment.' }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  return { ok: true }
}

const specSchema = z.object({
  order_id: z.string().uuid(),
  technical_specification: z
    .string()
    .trim()
    .min(20, 'Describe what was agreed — at least a sentence')
    .max(8000),
  addendum: z.string().trim().max(8000).optional(),
  reason: z.string().trim().min(3, 'Give a reason for the change').max(500),
})

/**
 * Updates the specification and records why, in one transaction.
 *
 * This goes through a database function rather than a plain update because the
 * reason has to reach the audit trigger. Every PostgREST call is its own
 * transaction, so a reason set by a separate call would already be gone by the
 * time the trigger fired.
 */
export async function updateOrderSpec(input: unknown): Promise<Result> {
  await requireProfile()

  const parsed = specSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]!.message, fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_order_spec', {
    p_order_id: values.order_id,
    p_technical_specification: values.technical_specification,
    p_addendum: values.addendum ?? null,
    p_reason: values.reason,
  })

  if (error) return { ok: false, error: 'Could not save the specification.' }

  revalidatePath(`/orders/${values.order_id}`)
  revalidatePath('/activity')
  return { ok: true }
}

/** Delivery date, PO number, status and notes. Never money. */
export async function updateOrderDetails(input: unknown): Promise<Result> {
  await requireProfile()

  const parsed = orderDetailsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('orders')
    .update({
      order_status: values.order_status,
      delivery_date: values.delivery_date || null,
      po_number: values.po_number ?? null,
      notes: values.notes ?? null,
    })
    .eq('id', values.order_id)

  if (error) return { ok: false, error: 'Could not save your changes.' }

  revalidatePath(`/orders/${values.order_id}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  return { ok: true }
}
