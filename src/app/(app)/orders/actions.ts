'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NO_FEATURE_ACCESS, editorOrNull } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { dbMessage } from '@/lib/db-message'
import { orderDetailsSchema, orderItemSchema, paymentSchema } from '@/lib/schemas/order'

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
  const profile = await editorOrNull('orders')
  if (!profile) return NO_FEATURE_ACCESS

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
  const profile = await editorOrNull('orders')
  if (!profile) return NO_FEATURE_ACCESS

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
  if (!(await editorOrNull('orders'))) return NO_FEATURE_ACCESS

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
  if (!(await editorOrNull('orders'))) return NO_FEATURE_ACCESS

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

  // The dispatch gate lives in Postgres and refuses in a full sentence naming
  // what is missing. Swallowing it left someone staring at "Could not save
  // your changes." with no idea a QA check was the thing in the way.
  if (error) return { ok: false, error: dbMessage(error.message, 'Could not save your changes.') }

  revalidatePath(`/orders/${values.order_id}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * The one database error a user can actually fix from this form.
 *
 * `resolve_zero_rate_reason()` refuses a 0% line when neither the line nor the
 * buyer's company carries a reason. That message is written for the person
 * typing, so it is passed through instead of being flattened into "could not
 * save"; everything else stays generic, since a raw Postgres error tells a user
 * nothing and tells an attacker something.
 */
function zeroRateErrorOr(error: { message?: string }, fallback: string): Result {
  if (error.message?.includes('0% line needs a reason')) {
    return { ok: false, error: error.message, fieldErrors: { zero_rate_reason: error.message } }
  }
  return { ok: false, error: fallback }
}

/**
 * Creates or updates a line item.
 *
 * The order value is never written here. A database trigger sums the live
 * lines into `orders.order_value` after this returns, and a second trigger
 * sums each line's own rounded tax into `orders.gst_amount` — so the money
 * follows the lines automatically and cannot be made to disagree with them.
 */
export async function saveOrderItem(input: unknown): Promise<Result> {
  const profile = await editorOrNull('orders')
  if (!profile) return NO_FEATURE_ACCESS

  const parsed = orderItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: flatten(parsed.error) }
  }
  const values = parsed.data
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', values.order_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!order) return { ok: false, error: 'That order no longer exists.' }

  const fields = {
    description: values.description,
    hsn_sac: values.hsn_sac || null,
    quantity: values.quantity,
    unit: values.unit,
    rate: values.rate,
    notes: values.notes || null,
    gst_rate: values.gst_rate,
    zero_rate_reason: values.zero_rate_reason || null,
  }

  if (values.id) {
    const { error } = await supabase.from('order_items').update(fields).eq('id', values.id)
    if (error) return zeroRateErrorOr(error, 'Could not save that line.')
  } else {
    // Next line number, counting removed lines too, so numbers are never
    // reused — a line 3 that reappears meaning something else is confusing
    // on a document someone printed last week.
    const { data: last } = await supabase
      .from('order_items')
      .select('line_no')
      .eq('order_id', values.order_id)
      .order('line_no', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await supabase.from('order_items').insert({
      ...fields,
      order_id: values.order_id,
      line_no: (last?.line_no ?? 0) + 1,
      created_by: profile.id,
    })
    if (error) return zeroRateErrorOr(error, 'Could not add that line.')
  }

  revalidatePath(`/orders/${values.order_id}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Removes a line. Soft delete, so the order's history stays readable and the
 * activity feed can still explain why the value dropped.
 */
export async function removeOrderItem(itemId: string, orderId: string): Promise<Result> {
  if (!(await editorOrNull('orders'))) return NO_FEATURE_ACCESS
  const supabase = await createClient()

  const { error } = await supabase
    .from('order_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
    .is('deleted_at', null)

  if (error) return { ok: false, error: 'Could not remove that line.' }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/dashboard')
  return { ok: true }
}
