import { z } from 'zod'
import { CURRENCY, RND_EXPENSE_KIND, RND_STAGE } from '@/lib/constants'

const enumKeys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
const optionalDate = z.union([isoDate, z.literal('')]).optional()

const moneyInput = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value
  return Number.isNaN(n) ? undefined : n
}, z.unknown())

export const rndProjectSchema = z
  .object({
    project_code: z.string().trim().max(40).optional(),
    project_name: z.string().trim().min(3, 'Give the project a name').max(200),
    description: z.string().trim().max(4000).optional(),
    currency: z.enum(enumKeys(CURRENCY)).default('INR'),
    approx_budget: moneyInput.pipe(
      z
        .number({ invalid_type_error: 'Enter a number' })
        .nonnegative('Budget cannot be negative')
        .max(999_999_999_99, 'That budget looks wrong')
        .optional()
    ),
    start_date: optionalDate,
    target_date: optionalDate,
    actual_end_date: optionalDate,
    stage: z.enum(enumKeys(RND_STAGE)).default('concept'),
    lead_id: z.string().uuid().optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  // A target before the start date is almost always a typo, and it would
  // render as a negative-width bar on the timeline.
  .refine((v) => !v.start_date || !v.target_date || v.target_date >= v.start_date, {
    message: 'Target date cannot be before the start date',
    path: ['target_date'],
  })

export type RndProjectInput = z.input<typeof rndProjectSchema>

/**
 * One line of R&D spend. A trigger sums the live rows of this ledger into
 * `rnd_projects.spent_to_date`, so that figure is never typed directly.
 */
export const rndExpenseSchema = z.object({
  project_id: z.string().uuid(),
  amount: moneyInput.pipe(
    z
      .number({ invalid_type_error: 'Enter the amount' })
      .positive('Amount must be more than zero')
      .max(999_999_999_99, 'That amount looks wrong')
  ),
  spent_on: isoDate,
  kind: z.enum(enumKeys(RND_EXPENSE_KIND)),
  description: z.string().trim().min(3, 'Describe what this was for').max(500),
  vendor: z.string().trim().max(200).optional(),
  reference: z.string().trim().max(120).optional(),
})

export type RndExpenseValues = z.output<typeof rndExpenseSchema>
