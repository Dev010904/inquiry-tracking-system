import { z } from 'zod'
import {
  COMPANY_TYPE,
  FOLLOWUP_CHANNEL,
  INQUIRY_STATUS,
  PRIORITY,
} from '@/lib/constants'

/**
 * One schema, used by the client form and re-validated inside the server
 * action. The client copy is a convenience; the server copy is the rule.
 */

const enumKeys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]]

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')

/**
 * Number inputs hand back strings, and an untouched one hands back ''. This
 * normalises both to a number or undefined before the numeric rules run, so
 * the same schema works on the client form and in the server action.
 */
const moneyInput = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value
  return Number.isNaN(n) ? undefined : n
}, z.unknown())

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid phone number')

/** New company created inline from the inquiry form. */
export const newCompanySchema = z.object({
  name: z.string().trim().min(2, 'Company name is required').max(200),
  type: z.enum(enumKeys(COMPANY_TYPE)),
  city: optionalText,
  state: optionalText,
})

/** New contact created inline. Phone or email — at least one way to reach them. */
export const newContactSchema = z
  .object({
    name: z.string().trim().min(2, 'Contact name is required').max(120),
    phone: z.union([phoneSchema, z.literal('')]).optional(),
    email: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]).optional(),
    designation: optionalText,
  })
  .refine((c) => Boolean(c.phone || c.email), {
    message: 'Give at least a phone number or an email',
    path: ['phone'],
  })

export const inquirySchema = z
  .object({
    inquiry_date: isoDate,
    // Exactly one of these two is supplied, enforced by the refine below.
    company_id: z.string().uuid().optional(),
    new_company: newCompanySchema.optional(),

    contact_id: z.string().uuid().optional(),
    new_contact: newContactSchema.optional(),

    source: optionalText,
    requirement_summary: z
      .string()
      .trim()
      .min(5, 'Describe what they asked for')
      .max(4000),
    estimated_value: moneyInput
      .pipe(
        z
          .number({ invalid_type_error: 'Enter a number' })
          .nonnegative('Value cannot be negative')
          .max(999_999_999_99, 'That value looks wrong')
          .optional()
      ),
    status: z.enum(enumKeys(INQUIRY_STATUS)).default('new'),
    priority: z.enum(enumKeys(PRIORITY)).default('medium'),
    owner_id: z.string().uuid().optional(),
    lost_reason: z.string().trim().max(500).optional(),

    // First follow-up. Optional on edit, strongly encouraged on create.
    followup_due: z.string().optional(),
    followup_channel: z.enum(enumKeys(FOLLOWUP_CHANNEL)).default('call'),
    followup_note: z.string().trim().max(500).optional(),
  })
  .refine((v) => Boolean(v.company_id) !== Boolean(v.new_company), {
    message: 'Pick an existing company or add a new one',
    path: ['company_id'],
  })
  .refine((v) => !(v.contact_id && v.new_contact), {
    message: 'Pick an existing contact or add a new one, not both',
    path: ['contact_id'],
  })
  .refine((v) => v.status !== 'lost' || Boolean(v.lost_reason), {
    message: 'Record why this was lost',
    path: ['lost_reason'],
  })

export type InquiryInput = z.input<typeof inquirySchema>
export type InquiryValues = z.output<typeof inquirySchema>

/**
 * Convert-to-order. `order_value` is the pre-GST figure and the only money
 * number anyone types — GST, total and balance are Postgres generated columns.
 */
export const convertToOrderSchema = z.object({
  inquiry_id: z.string().uuid(),
  order_date: isoDate,
  order_value: moneyInput.pipe(
    z
      .number({ invalid_type_error: 'Enter the order value' })
      .positive('Order value must be more than zero')
      .max(999_999_999_99, 'That value looks wrong')
  ),
  delivery_date: z.union([isoDate, z.literal('')]).optional(),
  po_number: optionalText,
  /**
   * What was agreed and what production will build to. Required, because an
   * order with no recorded specification is the thing that causes an argument
   * three months later.
   */
  technical_specification: z
    .string()
    .trim()
    .min(20, 'Describe what was agreed — at least a sentence')
    .max(8000),
  /** Variations agreed after the original specification. */
  addendum: z.string().trim().max(8000).optional(),
})

export type ConvertToOrderValues = z.output<typeof convertToOrderSchema>
