/**
 * The fallback rate for a preview only, when the real one is not to hand.
 *
 * GST is no longer one rate: it is set per line, and the authoritative figures
 * are maintained by triggers on `orders` from those lines. This constant exists
 * ONLY so a form can show a live preview before any line exists. Never persist
 * a value derived from it, and prefer `company_settings.default_gst_rate`
 * wherever it can be read.
 */
export const GST_RATE = 0.18

/**
 * Deliberately rate-free. It labels a figure that can be the sum of several
 * different rates, so naming one of them would be wrong on any mixed order.
 */
export const GST_LABEL = 'GST'

/**
 * The five currencies ANK trades in. Labels carry the code because "$" alone is
 * ambiguous on a screen that can also show CN¥ and ¥.
 *
 * Currency is picked once, on the inquiry or order, and inherited by everything
 * downstream — there is deliberately no selector on each form.
 */
export const CURRENCY = {
  INR: 'INR — Indian Rupee',
  USD: 'USD — US Dollar',
  EUR: 'EUR — Euro',
  JPY: 'JPY — Japanese Yen',
  CNY: 'CNY — Chinese Yuan',
} as const

/**
 * The GST slabs, as the quick picks on a line. Offered as a picker, but a rate
 * can still be typed: GST has carried odd rates before (0.25%, 1.5%, 3%) and a
 * form that cannot express one sends staff to a spreadsheet.
 *
 * GST 2.0 (in force from 22 September 2025) left 5%, 18% and the 40% rate;
 * 12% and 28% were abolished, so they are no longer offered. A line already
 * carrying one of them still shows it, as a typed rate, and issued documents
 * are snapshots that nothing here can change.
 *
 * 0 is a slab like any other here. What separates a 0% line from an exempt one
 * on a printed document is the recorded reason, not the number.
 */
export const GST_SLABS = [0, 5, 18, 40] as const

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

/**
 * Statuses from which an inquiry may be converted into a confirmed order.
 *
 * `confirmed` is here because a user can set that status by hand. Converting
 * also sets it, so an inquiry confirmed manually would otherwise have no path
 * to an order at all. The real guard against a duplicate is the unique
 * constraint on `orders.inquiry_id`, not this list.
 */
export const CONVERTIBLE_STATUSES: InquiryStatus[] = ['quoted', 'negotiation', 'confirmed']

/**
 * Derived from the list above so the two cannot drift apart — the copy naming
 * only Quoted and Negotiation outlived the list it described once already.
 */
export const CONVERTIBLE_STATUS_LABEL = ((labels: string[]) =>
  `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`)(
  CONVERTIBLE_STATUSES.map((s) => INQUIRY_STATUS[s])
)

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
 * Every part of the app a custom role can be granted or denied. The single
 * source of truth: `nav-items.ts` builds the menu from this list, and the
 * permission editor in Settings iterates it, so a feature cannot be added
 * without appearing in both.
 *
 * The order is the order they appear in the sidebar and in the editor.
 *
 * `settings` is deliberately NOT here and must never be added. Settings is
 * governed solely by `profiles.can_manage_settings`; if it were grantable,
 * an admin could invent a role that hands themselves Settings and the Phase 3
 * restriction would be gone. The database refuses it too — see the
 * `role_features_key_grantable` constraint.
 *
 * These keys are stored in `role_features.feature_key`. Renaming one is a
 * migration, not an edit.
 */
export const FEATURE_KEYS = [
  'dashboard',
  'inquiries',
  'orders',
  'rnd',
  'ip',
  'documents',
  'meetings',
  'companies',
  'activity',
  'reports',
  'payments',
  'attendance',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

/**
 * The four states a piece of assigned work moves through.
 *
 * `blocked` is deliberately not a terminal state — it is still outstanding and
 * still shows on the pending work card. Only `done` takes a task off the list,
 * and only `done` stamps `completed_at`.
 */
export const TASK_STATUS = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
} as const

export type TaskStatusKey = keyof typeof TASK_STATUS

/** Everything that still counts as outstanding work. */
export const OPEN_TASK_STATUSES: TaskStatusKey[] = ['open', 'in_progress', 'blocked']

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
  quotation: 'Quotation',
  proforma: 'Proforma invoice',
  tax_invoice: 'Tax invoice',
  bill_of_supply: 'Bill of supply',
  delivery_challan: 'Delivery challan',
  credit_note: 'Credit note',
  debit_note: 'Debit note',
} as const

/** The heading printed at the top of the page, in the supplied format's wording. */
export const DOCUMENT_TITLE: Record<keyof typeof DOCUMENT_TYPE, string> = {
  quotation: 'Quotation',
  proforma: 'Proforma Invoice',
  tax_invoice: 'Tax Invoice',
  bill_of_supply: 'Bill of Supply',
  delivery_challan: 'Delivery Challan',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
}

/** What the number is called on the page — "Quotation No.", "Invoice No.". */
export const DOCUMENT_NO_LABEL: Record<keyof typeof DOCUMENT_TYPE, string> = {
  quotation: 'Quotation No.',
  proforma: 'Proforma No.',
  tax_invoice: 'Invoice No.',
  bill_of_supply: 'Bill No.',
  delivery_challan: 'Challan No.',
  credit_note: 'Credit Note No.',
  debit_note: 'Debit Note No.',
}

export type DocumentType = keyof typeof DOCUMENT_TYPE

export const DOCUMENT_STATUS = {
  draft: 'Draft',
  issued: 'Issued',
  cancelled: 'Cancelled',
} as const

/** Only these three carry GST. The rest are not tax documents. */
export const TAXABLE_DOCUMENT_TYPES: DocumentType[] = ['tax_invoice', 'credit_note', 'debit_note']

/**
 * Types that PRINT tax, which is not the same list.
 *
 * A quotation shows what the tax will be so the buyer knows the real price,
 * but it creates no liability, needs no HSN and takes no statutory number.
 * Mirrors `doc_type_shows_tax()` in Postgres; `TAXABLE_DOCUMENT_TYPES` above
 * stays the statutory list and must not absorb this one.
 */
export const TAX_DISPLAYING_DOCUMENT_TYPES: DocumentType[] = [
  ...TAXABLE_DOCUMENT_TYPES,
  'quotation',
]

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

/**
 * The same states as a list in code order, for drop-downs.
 *
 * Object.entries(GST_STATES) is not in code order: JavaScript lists keys that
 * look like integers ("10".."97") before the others, and "01".."09" are not
 * integer-like because of the leading zero, so the menu began at Bihar and put
 * Jammu and Kashmir near the bottom.
 */
export const GST_STATE_OPTIONS: [code: string, name: string][] = Object.entries(GST_STATES).sort(
  ([a], [b]) => a.localeCompare(b)
)

export const QA_RESULT = {
  pass: 'Passed',
  conditional_pass: 'Passed with conditions',
  fail: 'Failed',
} as const

export const QA_MEDIA_KIND = { photo: 'Photo', video: 'Video' } as const

/**
 * The four qualification stages, in the order they happen.
 *
 * The owner named DQ, IQ and PQ. OQ is the standard fourth and normally sits
 * between IQ and PQ; leaving it out of a validation set is unusual, and a
 * client in a regulated industry will ask. It stays `not_started` if unused.
 */
export const QUALIFICATION_STAGE = {
  dq: 'Design Qualification',
  iq: 'Installation Qualification',
  oq: 'Operational Qualification',
  pq: 'Performance Qualification',
} as const

export const QUALIFICATION_STAGE_WHEN = {
  dq: 'Before manufacture — the design meets the requirement',
  iq: 'At site after delivery — installed correctly',
  oq: 'After installation — operates through its range',
  pq: 'In production use — performs consistently',
} as const

export const QUALIFICATION_STATUS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  passed: 'Passed',
  failed: 'Failed',
} as const

export const MEETING_TYPE = {
  site_visit: 'Site visit',
  review: 'Review',
  kickoff: 'Kick-off',
  handover: 'Handover',
  other: 'Other',
} as const

/** Statuses that need a passed QA check before an order can reach them. */
export const QA_GATED_STATUSES = ['dispatched', 'delivered', 'closed']

export const QA_BUCKET = 'qa-evidence'

/**
 * The state a GSTIN belongs to, from its first two digits.
 *
 * The document flow already derives place of supply this way —
 * `create_document()` fills `place_of_supply_code` from `left(comp.gstin, 2)`
 * and `place_of_supply_name` from `companies.state`. So the two have to agree,
 * and this is the single place that says what agreement means.
 *
 * Returns null for a GSTIN whose prefix is not an allotted code, which is a
 * malformed GSTIN rather than a new state.
 */
export function gstStateFor(gstin: string | null | undefined): { code: string; name: string } | null {
  const code = gstin?.trim().slice(0, 2)
  if (!code) return null
  const name = GST_STATES[code]
  return name ? { code, name } : null
}
