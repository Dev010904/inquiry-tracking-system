import { z } from 'zod'
import { ITEM_UNIT, ORDER_STATUS, PAYMENT_MODE } from '@/lib/constants'

const enumKeys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')

/** Number inputs arrive as strings; '' means "not filled in". */
const moneyInput = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value
  return Number.isNaN(n) ? undefined : n
}, z.unknown())

const percentInput = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isNaN(n) ? undefined : n
}, z.unknown())

/**
 * A payment against an order. `orders.advance_received` is maintained by a
 * database trigger that sums this ledger — nothing here writes it directly,
 * and `balance_pending` follows from the generated column.
 */
export const paymentSchema = z.object({
  order_id: z.string().uuid(),
  amount: moneyInput.pipe(
    z
      .number({ invalid_type_error: 'Enter the amount received' })
      .positive('Amount must be more than zero')
      .max(999_999_999_99, 'That amount looks wrong')
  ),
  paid_on: isoDate,
  mode: z.enum(enumKeys(PAYMENT_MODE)),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
})

export type PaymentValues = z.output<typeof paymentSchema>

/**
 * A dated progress note. `progress_pct` is optional: plenty of updates are
 * "spoke to the fabricator" with no movement on the bar.
 */
export const workUpdateSchema = z.object({
  parent_type: z.enum(['order', 'rnd']),
  parent_id: z.string().uuid(),
  update_date: isoDate,
  note: z.string().trim().min(3, 'Describe what was done').max(2000),
  progress_pct: percentInput.pipe(
    z
      .number({ invalid_type_error: 'Enter a number' })
      .int('Whole numbers only')
      .min(0, 'Cannot be below 0')
      .max(100, 'Cannot be above 100')
      .optional()
  ),
})

export type WorkUpdateValues = z.output<typeof workUpdateSchema>

/** Editable order fields. `order_value` aside, none of these are money. */
export const orderDetailsSchema = z.object({
  order_id: z.string().uuid(),
  order_status: z.enum(enumKeys(ORDER_STATUS)),
  delivery_date: z.union([isoDate, z.literal('')]).optional(),
  po_number: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export type OrderDetailsValues = z.output<typeof orderDetailsSchema>

/**
 * A line on an order.
 *
 * `amount` is deliberately absent — Postgres generates it from quantity x rate,
 * and the order value is the trigger-maintained sum of these lines. Nothing
 * here lets anyone type a total.
 */
export const orderItemSchema = z.object({
  id: z.string().uuid().optional(),
  order_id: z.string().uuid(),
  description: z.string().trim().min(3, 'Describe what is being supplied').max(500),
  hsn_sac: z
    .string()
    .trim()
    .max(10)
    .regex(/^\d*$/, 'HSN/SAC codes are digits only')
    .optional()
    .or(z.literal('')),
  quantity: moneyInput.pipe(
    z
      .number({ invalid_type_error: 'Enter a quantity' })
      .positive('Quantity must be more than zero')
      .max(9_999_999)
  ),
  unit: z.enum(enumKeys(ITEM_UNIT)),
  rate: moneyInput.pipe(
    z.number({ invalid_type_error: 'Enter a rate' }).min(0, 'Rate cannot be negative').max(99_999_999)
  ),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  // Not constrained to the five common slabs: GST has carried unusual rates
  // before (1.5%, 7.5%, 3% on bullion) and a form that cannot express one
  // would send staff to a spreadsheet instead.
  gst_rate: moneyInput.pipe(
    z
      .number({ invalid_type_error: 'Enter a GST rate' })
      .min(0, 'GST rate cannot be negative')
      .max(100, 'GST rate cannot exceed 100%')
  ),
  // A 0% line and an exempt line print differently, and the difference is this
  // sentence. Deliberately not required here: `resolve_zero_rate_reason()` in
  // Postgres falls back to the buyer's recorded exemption reason, and a schema
  // rule demanding a typed reason would defeat that fallback. The database
  // raises if neither exists, and the action surfaces that message.
  zero_rate_reason: z.string().trim().max(300).optional().or(z.literal('')),
})

export type OrderItemValues = z.output<typeof orderItemSchema>
