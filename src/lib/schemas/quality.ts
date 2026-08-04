import { z } from 'zod'
import { MEETING_TYPE, QA_RESULT, QUALIFICATION_STAGE, QUALIFICATION_STATUS } from '@/lib/constants'

const enumKeys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))

/**
 * A QA check before dispatch.
 *
 * Photos and the video link are validated separately, after upload — the
 * database refuses to let the order be dispatched without them, so the form
 * warns rather than blocks the record itself. A half-finished QA record is
 * useful; a dispatch without evidence is not.
 */
export const qaCheckSchema = z.object({
  id: z.string().uuid().optional(),
  order_id: z.string().uuid(),
  report_no: optional(60),
  checked_on: isoDate,
  result: z.enum(enumKeys(QA_RESULT)),
  description: z
    .string()
    .trim()
    .min(10, 'Describe what was checked — at least a sentence')
    .max(4000),
  observations: optional(4000),
  conditions: optional(2000),
})

export type QaCheckValues = z.output<typeof qaCheckSchema>

export const qaMediaSchema = z
  .object({
    qa_check_id: z.string().uuid(),
    kind: z.enum(['photo', 'video']),
    storage_path: optional(500),
    external_url: z.string().trim().url('Paste the full link').optional().or(z.literal('')),
    caption: optional(300),
  })
  .refine((v) => Boolean(v.storage_path) !== Boolean(v.external_url), {
    message: 'Give either an uploaded file or a link, not both',
    path: ['external_url'],
  })

export const qualificationSchema = z.object({
  order_id: z.string().uuid(),
  stage: z.enum(enumKeys(QUALIFICATION_STAGE)),
  status: z.enum(enumKeys(QUALIFICATION_STATUS)),
  planned_date: z.union([isoDate, z.literal('')]).optional(),
  performed_on: z.union([isoDate, z.literal('')]).optional(),
  customer_representative: optional(200),
  customer_signed_off: z.coerce.boolean().default(false),
  signed_off_on: z.union([isoDate, z.literal('')]).optional(),
  summary: optional(4000),
  notes: optional(4000),
})

export type QualificationValues = z.output<typeof qualificationSchema>

/** Minutes of a meeting. Attendees arrive as one name per line. */
export const meetingSchema = z.object({
  id: z.string().uuid().optional(),
  meeting_date: isoDate,
  meeting_type: z.enum(enumKeys(MEETING_TYPE)),
  subject: z.string().trim().min(3, 'Give the meeting a subject').max(300),
  location: optional(300),
  company_id: z.string().uuid().optional().or(z.literal('')),
  inquiry_id: z.string().uuid().optional().or(z.literal('')),
  order_id: z.string().uuid().optional().or(z.literal('')),
  internal_attendees: optional(2000),
  client_attendees: optional(2000),
  agenda: optional(4000),
  discussion: optional(8000),
  decisions: optional(4000),
  next_steps: optional(4000),
})

export type MeetingValues = z.output<typeof meetingSchema>

export const meetingActionSchema = z.object({
  id: z.string().uuid().optional(),
  meeting_id: z.string().uuid(),
  action: z.string().trim().min(3, 'Say what needs doing').max(500),
  owner_id: z.string().uuid().optional().or(z.literal('')),
  due_on: z.union([isoDate, z.literal('')]).optional(),
  is_done: z.coerce.boolean().default(false),
})

export type MeetingActionValues = z.output<typeof meetingActionSchema>
