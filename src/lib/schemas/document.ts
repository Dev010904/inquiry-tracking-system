import { z } from 'zod'
import { DOCUMENT_TYPE } from '@/lib/constants'

const enumKeys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))

/**
 * The supplier's own details.
 *
 * Everything is optional here so the form can be saved half-finished — the
 * owner will fill it in over a few sittings. The completeness check happens
 * at issue time instead, where the database refuses and names what is
 * missing. That is the right place for it: a half-filled settings page is
 * harmless, a half-filled invoice is not.
 */
export const companySettingsSchema = z.object({
  legal_name: optional(200),
  trade_name: optional(200),
  address_line1: optional(200),
  address_line2: optional(200),
  city: optional(100),
  state_name: optional(100),
  state_code: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'Two digits, as on the GSTIN')
    .optional()
    .or(z.literal('')),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Six digits')
    .optional()
    .or(z.literal('')),
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
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Ten characters, as on the PAN card')
    .optional()
    .or(z.literal('')),
  phone: optional(40),
  email: z.string().trim().email('Not a valid email').optional().or(z.literal('')),
  website: optional(200),
  bank_name: optional(120),
  bank_account_no: optional(40),
  bank_ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Eleven characters, e.g. HDFC0001234')
    .optional()
    .or(z.literal('')),
  bank_branch: optional(120),
  signatory_name: optional(120),
  signatory_designation: optional(120),
  default_currency: z.enum(['INR', 'USD', 'EUR', 'JPY', 'CNY']).default('INR'),
  default_gst_rate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 18 : Number(v)),
    z.number().min(0, 'Cannot be negative').max(28, 'GST does not go above 28%')
  ),
  invoice_terms: optional(2000),
  // Everything the printed documents put on the page. Held here rather than in
  // the layout so the owner changes an MSME number or a payment term without a
  // deployment.
  msme_no: optional(60),
  jurisdiction_city: optional(80),
  payment_terms: optional(500),
  delivery_timeline: optional(500),
  quotation_terms: optional(2000),
  default_installation_scope: optional(200),
  default_visit_rate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().min(0, 'Cannot be negative').max(99_999_999).nullable()
  ),
  default_visit_count: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int('Whole visits only').min(0, 'Cannot be negative').max(999).nullable()
  ),
  // A checkbox posts nothing at all when unticked, so an absent value has to
  // mean false here — while a settings row that predates the column still
  // defaults to true in the database. On rather than off is the safe default:
  // a print with no supplier GSTIN is not a valid tax invoice.
  print_supplier_header: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()),
})

export type CompanySettingsValues = z.output<typeof companySettingsSchema>

/**
 * Validity in days, shared by every path that sets it. 0 is allowed and means
 * the price holds for the day it was quoted.
 */
const validDays = z.coerce
  .number()
  .int('Whole days only')
  .min(0, 'Cannot be negative')
  .max(365, '365 days at most')
  .default(15)

/** Raising a document against an order. */
export const createDocumentSchema = z.object({
  order_id: z.string().uuid(),
  doc_type: z.enum(enumKeys(DOCUMENT_TYPE)),
  doc_date: isoDate,
  place_of_supply_code: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'Pick the place of supply')
    .optional()
    .or(z.literal('')),
  parent_invoice_id: z.string().uuid().optional().or(z.literal('')),
  notes: optional(2000),
  reason: optional(500),
  // How long the document holds good. 15 days is the house default; it is
  // typed per document because it is negotiated per customer. The sheet prints
  // the resulting date — see validTill() in lib/format.
  valid_days: validDays,
})

export type CreateDocumentValues = z.output<typeof createDocumentSchema>

/**
 * The terms block on a draft, saved as a unit.
 *
 * Payment terms and the delivery timeline used to live in company settings,
 * which made them the same on every document the firm had ever sent. They are
 * negotiated per deal, so they belong here.
 *
 * The site installation line was a fixed English sentence with the rate written
 * into it. It is now a scope chosen from a list the owner controls, plus the
 * two numbers that vary, and the sentence is composed when the document prints.
 */
export const documentTermsSchema = z.object({
  invoice_id: z.string().uuid(),
  valid_days: validDays,
  payment_terms: optional(500),
  delivery_timeline: optional(500),
  installation_scope: optional(200),
  // Blank means "no visit charge on this document" rather than zero, so both
  // numbers pass through as null when the boxes are left empty. Coercing '' to
  // 0 would print "@ Rs. 0/-" on a document that simply does not charge for
  // visits.
  visit_rate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().min(0, 'A visit rate cannot be negative').max(99_999_999).nullable()
  ),
  visit_count: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int('Whole visits only').min(0, 'Cannot be negative').max(999).nullable()
  ),
})

export type DocumentTermsValues = z.output<typeof documentTermsSchema>
