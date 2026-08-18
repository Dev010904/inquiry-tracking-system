import { z } from 'zod'
import { COMPANY_TYPE, gstStateFor } from '@/lib/constants'

const enumKeys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]]

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))

/**
 * A client record.
 *
 * The same GSTIN pattern the supplier's own settings use — a buyer GSTIN that
 * does not match is not a GSTIN, and storing it would put an invalid number on
 * a tax invoice that the customer then cannot claim credit against.
 */
export const companySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Give the client a name of at least two characters')
      .max(200, 'Keep the name under 200 characters'),
    type: z.enum(enumKeys(COMPANY_TYPE)),
    address: optional(500),
    city: optional(100),
    state: optional(100),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        'That is not a valid GSTIN — check it against the certificate'
      )
      .optional()
      .or(z.literal('')),
    // Never a bare coercion: z.coerce.boolean() turns the string "false" into
    // true, and this switch decides tax invoice versus bill of supply.
    gst_applicable: z.preprocess(
      (v) => v === true || v === 'true' || v === 'on',
      z.boolean()
    ),
    gst_exemption_reason: optional(500),
    notes: optional(2000),
  })
  .superRefine((v, ctx) => {
    // An auditor asks why a bill of supply was raised instead of a tax
    // invoice. The answer has to be on the record, not in someone's memory.
    if (!v.gst_applicable && !v.gst_exemption_reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gst_exemption_reason'],
        message:
          'Say why GST does not apply — this is what a bill of supply is justified by.',
      })
    }

    if (!v.gstin) return

    const derived = gstStateFor(v.gstin)
    if (!derived) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstin'],
        message: 'The first two digits are not an allotted state code.',
      })
      return
    }

    // place_of_supply_code comes from the GSTIN and place_of_supply_name from
    // this column, so a disagreement prints a document that contradicts
    // itself. Rejected rather than quietly overwritten — the form fills the
    // state in as the GSTIN is typed, so this is the case where someone
    // deliberately changed it back.
    if (v.state?.trim() && v.state.trim().toLowerCase() !== derived.name.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state'],
        message: `That GSTIN is registered in ${derived.name} (${derived.code}). The state must match, or the place of supply on their invoice will be wrong.`,
      })
    }
  })

export type CompanyInput = z.input<typeof companySchema>
export type CompanyValues = z.output<typeof companySchema>

/** A person at a client. */
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Give the contact a name of at least two characters')
    .max(160, 'Keep the name under 160 characters'),
  designation: optional(120),
  phone: optional(40),
  email: z.string().trim().email('Not a valid email').optional().or(z.literal('')),
  is_primary: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()),
})

export type ContactInput = z.input<typeof contactSchema>
