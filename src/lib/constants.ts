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

export const IP_ROUTE = {
  provisional: 'Provisional',
  complete: 'Complete Specification',
  pct: 'PCT',
  national_phase: 'National Phase',
  unregistered: 'Unregistered',
} as const
export type IpRoute = keyof typeof IP_ROUTE

export const CONFIDENTIALITY = {
  public: 'Public',
  internal: 'Internal',
  restricted: 'Restricted',
} as const
export type Confidentiality = keyof typeof CONFIDENTIALITY

/** IP statuses that are closed — no renewal chasing needed. */
export const DEAD_IP_STATUSES = ['refused', 'abandoned', 'lapsed'] as const

export const USER_ROLE = { admin: 'Admin', staff: 'Staff' } as const
export type UserRole = keyof typeof USER_ROLE

/**
 * Lead times for the dashboard alarm panel, in days.
 * IP renewals are irreversible if missed, so they surface far earlier.
 */
export const FOLLOWUP_LEAD_DAYS = 7
export const IP_LEAD_DAYS = [90, 30, 7] as const

/** Units a line item can be measured in. */
export const ITEM_UNIT = {
  nos: 'Nos',
  set: 'Set',
  kg: 'Kg',
  m: 'Metre',
  hour: 'Hour',
  lot: 'Lot',
} as const

export type ItemUnit = keyof typeof ITEM_UNIT

/** The six documents this system can raise. */
export const DOCUMENT_TYPE = {
  proforma: 'Proforma invoice',
  tax_invoice: 'Tax invoice',
  bill_of_supply: 'Bill of supply',
  delivery_challan: 'Delivery challan',
  credit_note: 'Credit note',
  debit_note: 'Debit note',
} as const

export type DocumentType = keyof typeof DOCUMENT_TYPE

export const DOCUMENT_STATUS = {
  draft: 'Draft',
  issued: 'Issued',
  cancelled: 'Cancelled',
} as const

/** Only these three carry GST. The rest are not tax documents. */
export const TAXABLE_DOCUMENT_TYPES: DocumentType[] = ['tax_invoice', 'credit_note', 'debit_note']

/** The copies an Indian tax invoice is printed in, for goods. */
export const INVOICE_COPIES = {
  original: 'Original for Recipient',
  duplicate: 'Duplicate for Transporter',
  triplicate: 'Triplicate for Supplier',
} as const

export type InvoiceCopy = keyof typeof INVOICE_COPIES

/** GST state codes, for place of supply. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
}
