import { z } from 'zod'
import { CONFIDENTIALITY, IP_ROUTE, IP_STATUS, IP_TYPE } from '@/lib/constants'

const enumKeys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
const optionalDate = z.union([isoDate, z.literal('')]).optional()

const moneyInput = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value
  return Number.isNaN(n) ? undefined : n
}, z.unknown())

export const ipAssetSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the asset a title').max(300),
    ip_type: z.enum(enumKeys(IP_TYPE)),
    status: z.enum(enumKeys(IP_STATUS)).default('idea'),
    protection_route: z.union([z.enum(enumKeys(IP_ROUTE)), z.literal('')]).optional(),
    jurisdiction: z.string().trim().min(2, 'Jurisdiction is required').max(80).default('India'),
    application_no: z.string().trim().max(120).optional(),
    registration_no: z.string().trim().max(120).optional(),
    rnd_project_id: z.union([z.string().uuid(), z.literal('')]).optional(),
    filing_date: optionalDate,
    publication_date: optionalDate,
    grant_date: optionalDate,
    expiry_date: optionalDate,
    next_renewal_date: optionalDate,
    /** Free text in the form, split on commas before it reaches Postgres. */
    inventors: z.string().trim().max(500).optional(),
    owner_entity: z.string().trim().max(200).optional(),
    attorney_firm: z.string().trim().max(200).optional(),
    attorney_contact: z.string().trim().max(200).optional(),
    confidentiality: z.enum(enumKeys(CONFIDENTIALITY)).default('internal'),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((v) => !v.filing_date || !v.grant_date || v.grant_date >= v.filing_date, {
    message: 'Grant date cannot be before the filing date',
    path: ['grant_date'],
  })
  .refine((v) => !v.expiry_date || !v.filing_date || v.expiry_date >= v.filing_date, {
    message: 'Expiry cannot be before the filing date',
    path: ['expiry_date'],
  })

export type IpAssetInput = z.input<typeof ipAssetSchema>

/**
 * A dated event on an asset — a filing, an office action, a renewal payment.
 * `cost` sums into `ip_assets.cost_to_date` via trigger, so that total is
 * never typed directly.
 */
export const ipEventSchema = z.object({
  ip_asset_id: z.string().uuid(),
  event_date: isoDate,
  event_type: z.string().trim().min(2, 'What happened?').max(120),
  due_date: optionalDate,
  cost: moneyInput.pipe(
    z
      .number({ invalid_type_error: 'Enter a number' })
      .nonnegative('Cost cannot be negative')
      .max(999_999_999_99, 'That cost looks wrong')
      .optional()
  ),
  note: z.string().trim().max(2000).optional(),
})

export type IpEventValues = z.output<typeof ipEventSchema>
