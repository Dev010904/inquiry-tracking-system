/**
 * GST is fixed at 18% by company policy.
 *
 * The authoritative calculation lives in Postgres as GENERATED columns on the
 * `orders` table. This constant exists ONLY so forms can show a live preview
 * as the user types the order value. Never persist a value derived from it.
 */
export const GST_RATE = 0.18
export const GST_LABEL = 'GST @ 18%'

export const INQUIRY_STATUS = {
  new: 'New',
  in_discussion: 'In Discussion',
  quoted: 'Quoted',
  negotiation: 'Negotiation',
  confirmed: 'Confirmed',
  lost: 'Lost',
  on_hold: 'On Hold',
} as const
export type InquiryStatus = keyof typeof INQUIRY_STATUS

/** Statuses from which an inquiry may be converted into a confirmed order. */
export const CONVERTIBLE_STATUSES: InquiryStatus[] = ['quoted', 'negotiation']

export const PRIORITY = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
} as const
export type Priority = keyof typeof PRIORITY

export const COMPANY_TYPE = {
  company: 'Company',
  school: 'School',
  institution: 'Institution',
} as const
export type CompanyType = keyof typeof COMPANY_TYPE

export const ORDER_STATUS = {
  pending: 'Pending',
  in_production: 'In Production',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  closed: 'Closed',
} as const
export type OrderStatus = keyof typeof ORDER_STATUS

/** Order statuses where a delivery date in the past counts as overdue. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ['pending', 'in_production', 'dispatched']

export const PAYMENT_MODE = {
  cash: 'Cash',
  neft: 'NEFT / RTGS',
  upi: 'UPI',
  cheque: 'Cheque',
  other: 'Other',
} as const
export type PaymentMode = keyof typeof PAYMENT_MODE

export const FOLLOWUP_CHANNEL = {
  call: 'Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  visit: 'Visit',
  other: 'Other',
} as const
export type FollowupChannel = keyof typeof FOLLOWUP_CHANNEL

export const RND_STAGE = {
  concept: 'Concept',
  design: 'Design',
  prototype: 'Prototype',
  testing: 'Testing',
  completed: 'Completed',
  shelved: 'Shelved',
} as const
export type RndStage = keyof typeof RND_STAGE

export const RND_EXPENSE_KIND = {
  material: 'Material',
  component: 'Component',
  service: 'Service / vendor',
  tooling: 'Tooling',
  testing: 'Testing',
  travel: 'Travel',
  other: 'Other',
} as const
export type RndExpenseKind = keyof typeof RND_EXPENSE_KIND

export const IP_TYPE = {
  patent: 'Patent',
  design: 'Design Registration',
  trademark: 'Trademark',
  copyright: 'Copyright',
  trade_secret: 'Trade Secret',
  know_how: 'Know-how',
} as const
export type IpType = keyof typeof IP_TYPE

export const IP_STATUS = {
  idea: 'Idea',
  disclosure_filed: 'Disclosure Filed',
  drafting: 'Drafting',
  filed: 'Filed',
  published: 'Published',
  under_examination: 'Under Examination',
  granted: 'Granted',
  refused: 'Refused',
  abandoned: 'Abandoned',
  lapsed: 'Lapsed',
} as const
export type IpStatus = keyof typeof IP_STATUS

export const USER_ROLE = { admin: 'Admin', staff: 'Staff' } as const
export type UserRole = keyof typeof USER_ROLE

/**
 * Lead times for the dashboard alarm panel, in days.
 * IP renewals are irreversible if missed, so they surface far earlier.
 */
export const FOLLOWUP_LEAD_DAYS = 7
export const IP_LEAD_DAYS = [90, 30, 7] as const
