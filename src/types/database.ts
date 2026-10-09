/**
 * Mirrors the live Supabase schema (project vozvdtgsinocrohmasvq).
 *
 * Hand-maintained, despite the `db:types` script. That script writes the raw
 * generator output, which has none of the named row aliases the application
 * imports (`ProfileRow`, `OrderRow`, …) and would not compile. After a
 * migration, edit the affected row type here to match.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type CompanyType = 'company' | 'school' | 'institution'
export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'JPY' | 'CNY'
export type Confidentiality = 'public' | 'internal' | 'restricted'
export type FollowupChannel = 'call' | 'email' | 'whatsapp' | 'visit' | 'other'
export type InquiryStatus =
  | 'new' | 'in_discussion' | 'quoted' | 'negotiation' | 'confirmed' | 'lost' | 'on_hold'
export type IpRoute = 'provisional' | 'complete' | 'pct' | 'national_phase' | 'unregistered'
export type IpStatus =
  | 'idea' | 'disclosure_filed' | 'drafting' | 'filed' | 'published'
  | 'under_examination' | 'granted' | 'refused' | 'abandoned' | 'lapsed'
export type IpType = 'patent' | 'design' | 'trademark' | 'copyright' | 'trade_secret' | 'know_how'
export type OrderStatus = 'pending' | 'in_production' | 'dispatched' | 'delivered' | 'closed'
export type ParentKind = 'order' | 'rnd'
export type PaymentMode = 'cash' | 'neft' | 'upi' | 'cheque' | 'other'
export type PriorityLevel = 'low' | 'medium' | 'high'
export type RndStage = 'concept' | 'design' | 'prototype' | 'testing' | 'completed' | 'shelved'
export type RndExpenseKind =
  | 'material' | 'component' | 'service' | 'tooling' | 'testing' | 'travel' | 'other'
export type UserRole = 'admin' | 'staff'
export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done'

type Timestamps = { created_at: string; updated_at: string }

export type ProfileRow = Timestamps & {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: UserRole
  is_active: boolean
  can_manage_settings: boolean
  /**
   * Optional custom role. NULL means fall back to `role` above.
   *
   * This governs feature visibility only. The admin capability that RLS
   * depends on is still `role`; the two must not be merged.
   */
  role_id: string | null
}

export type RoleRow = Timestamps & {
  id: string
  name: string
  description: string | null
  /** Seeded roles. Cannot be renamed or deleted — enforced by trigger. */
  is_system: boolean
  created_by: string | null
}

export type TaskRow = Timestamps & {
  id: string
  parent_type: ParentKind
  parent_id: string
  title: string
  detail: string | null
  status: TaskStatus
  due_date: string | null
  assigned_to: string
  assigned_by: string | null
  /** Stamped and cleared by `sync_task_bookkeeping()`. Never write it. */
  completed_at: string | null
  created_by: string | null
}

export type RoleFeatureRow = {
  role_id: string
  /** One of `FEATURE_KEYS`. Never 'settings' — the database refuses it. */
  feature_key: string
  can_view: boolean
  can_edit: boolean
}

export type CompanyRow = Timestamps & {
  gst_applicable: boolean
  gst_exemption_reason: string | null
  id: string
  name: string
  type: CompanyType
  city: string | null
  state: string | null
  gstin: string | null
  address: string | null
  notes: string | null
  deleted_at: string | null
  created_by: string | null
}

export type ContactRow = Timestamps & {
  id: string
  company_id: string
  name: string
  phone: string | null
  email: string | null
  designation: string | null
  is_primary: boolean
  deleted_at: string | null
  created_by: string | null
}

export type InquiryRow = Timestamps & {
  id: string
  inquiry_no: string | null
  inquiry_date: string
  company_id: string
  contact_id: string | null
  source: string | null
  requirement_summary: string
  estimated_value: number | null
  currency: CurrencyCode
  status: InquiryStatus
  priority: PriorityLevel
  owner_id: string | null
  lost_reason: string | null
  deleted_at: string | null
  created_by: string | null
}

export type FollowupRow = Timestamps & {
  id: string
  inquiry_id: string
  due_at: string
  channel: FollowupChannel
  note: string
  is_done: boolean
  done_at: string | null
  outcome: string | null
  snoozed_to: string | null
  assigned_to: string | null
  created_by: string | null
}

export type OrderRow = Timestamps & {
  requires_qualification: boolean
  qa_override_reason: string | null
  qa_overridden_by: string | null
  qa_overridden_at: string | null
  id: string
  order_no: string | null
  inquiry_id: string
  order_date: string
  po_number: string | null
  order_value: number
  currency: CurrencyCode
  advance_received: number
  /** Generated column — read only. */
  gst_amount: number | null
  /** Generated column — read only. */
  total_with_gst: number | null
  /** Generated column — read only. */
  balance_pending: number | null
  delivery_date: string | null
  order_status: OrderStatus
  completion_pct: number
  notes: string | null
  /** What was agreed and what production builds to. Required at conversion. */
  technical_specification: string | null
  /** Variations agreed after the original specification. */
  addendum: string | null
  deleted_at: string | null
  created_by: string | null
}

export type QaResult = 'pass' | 'fail' | 'conditional_pass'
export type QaMediaKind = 'photo' | 'video'
export type QualificationStage = 'dq' | 'iq' | 'oq' | 'pq'
export type QualificationStatus = 'not_started' | 'in_progress' | 'passed' | 'failed'
export type MeetingType = 'site_visit' | 'review' | 'kickoff' | 'handover' | 'other'

export type QaCheckRow = Timestamps & {
  id: string
  order_id: string
  report_no: string | null
  checked_on: string
  checked_by: string | null
  result: QaResult
  description: string
  observations: string | null
  conditions: string | null
  approved_by: string | null
  approved_at: string | null
  deleted_at: string | null
  created_by: string | null
}

export type QaMediaRow = {
  id: string
  qa_check_id: string
  kind: QaMediaKind
  storage_path: string | null
  external_url: string | null
  caption: string | null
  uploaded_by: string | null
  created_at: string
}

export type QualificationRow = Timestamps & {
  id: string
  order_id: string
  stage: QualificationStage
  status: QualificationStatus
  planned_date: string | null
  performed_on: string | null
  performed_by: string | null
  customer_representative: string | null
  customer_signed_off: boolean
  signed_off_on: string | null
  summary: string | null
  document_path: string | null
  notes: string | null
  created_by: string | null
}

export type MeetingRow = Timestamps & {
  id: string
  meeting_date: string
  meeting_type: MeetingType
  location: string | null
  company_id: string | null
  inquiry_id: string | null
  order_id: string | null
  subject: string
  internal_attendees: string[]
  client_attendees: string[]
  agenda: string | null
  discussion: string | null
  decisions: string | null
  next_steps: string | null
  deleted_at: string | null
  created_by: string | null
}

export type MeetingActionRow = Timestamps & {
  id: string
  meeting_id: string
  action: string
  owner_id: string | null
  due_on: string | null
  is_done: boolean
  done_at: string | null
  followup_id: string | null
}

export type DocumentType =
  | 'quotation'
  | 'proforma'
  | 'tax_invoice'
  | 'bill_of_supply'
  | 'delivery_challan'
  | 'credit_note'
  | 'debit_note'
export type DocumentStatus = 'draft' | 'issued' | 'cancelled'

/**
 * One entry in the site-installation dropdown offered while a document is
 * being written.
 *
 * A table rather than a TypeScript union because the list is the owner's, not
 * ours: a scope the firm starts offering next month must be addable from the
 * document screen, without a deployment. The document stores the label, not
 * this id — see `InvoiceRow.installation_scope`.
 */
export type InstallationOptionRow = {
  id: string
  label: string
  sort_order: number
  created_by: string | null
  created_at: string
}

/** The supplier's own identity and tax configuration. One row. */
export type CompanySettingsRow = Timestamps & {
  id: string
  singleton: boolean
  legal_name: string | null
  trade_name: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state_name: string | null
  state_code: string | null
  pincode: string | null
  gstin: string | null
  pan: string | null
  phone: string | null
  email: string | null
  website: string | null
  bank_name: string | null
  bank_account_no: string | null
  bank_ifsc: string | null
  bank_branch: string | null
  signatory_name: string | null
  signatory_designation: string | null
  default_gst_rate: number
  default_currency: CurrencyCode
  invoice_terms: string | null
  msme_no: string | null
  jurisdiction_city: string | null
  payment_terms: string | null
  delivery_timeline: string | null
  quotation_terms: string | null
  /**
   * The house default for the installation line, copied onto each new
   * document. Held as three fields rather than as the sentence it used to be,
   * so the rate can be changed without editing prose — and so the document can
   * disagree with the default where a customer negotiated something else.
   */
  default_installation_scope: string | null
  default_visit_rate: number | null
  default_visit_count: number | null
  print_supplier_header: boolean
}

export type InvoiceRow = Timestamps & {
  id: string
  doc_type: DocumentType
  status: DocumentStatus
  fy: string | null
  seq_number: number | null
  doc_no: string | null
  doc_date: string
  order_id: string | null
  /** Quotations only — they are raised before there is an order to point at. */
  inquiry_id: string | null
  company_id: string
  parent_invoice_id: string | null
  place_of_supply_code: string | null
  place_of_supply_name: string | null
  reverse_charge: boolean
  supplier_snapshot: CompanySettingsRow | null
  buyer_snapshot: {
    name: string | null
    address: string | null
    city: string | null
    state: string | null
    gstin: string | null
    gst_applicable: boolean | null
    contact_name: string | null
    contact_phone: string | null
  } | null
  taxable_value: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  total_tax: number
  round_off: number
  grand_total: number
  /** Null on a document that carries no tax, so the layout can omit the line. */
  tax_amount_in_words: string | null
  /**
   * Both null unless the parent order is priced in a foreign currency. The tax
   * columns above are always INR; these record what that INR was derived from.
   */
  exchange_rate: number | null
  base_currency: CurrencyCode | null
  amount_in_words: string | null
  notes: string | null
  terms: string | null
  reason: string | null
  issued_at: string | null
  issued_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  /**
   * How long the document stays valid, in days from `doc_date`. The sheet
   * prints the resulting date rather than this number — the maker agrees a
   * period, the customer reads a deadline.
   */
  valid_days: number
  /**
   * Terms as they apply to THIS deal, seeded from company settings when the
   * draft is raised and editable until it is issued. Null on a document
   * raised before these columns existed; the layout falls back to the
   * supplier snapshot for those.
   */
  payment_terms: string | null
  delivery_timeline: string | null
  /**
   * The chosen `installation_options` label, copied rather than referenced —
   * renaming an option later must not rewrite a document already sent.
   */
  installation_scope: string | null
  visit_rate: number | null
  visit_count: number | null
  /** Null on rows cancelled before the column existed. */
  cancelled_by: string | null
  created_by: string | null
}

export type InvoiceLineRow = {
  id: string
  invoice_id: string
  line_no: number
  description: string
  hsn_sac: string | null
  quantity: number
  unit: ItemUnit
  rate: number
  taxable_value: number
  gst_rate: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  line_total: number
  zero_rate_reason: string | null
  created_at: string
}

export type ItemUnit = 'nos' | 'set' | 'kg' | 'm' | 'hour' | 'lot'

/**
 * A line on an order. `amount` is generated by Postgres as quantity x rate,
 * and the sum of live lines is written into `orders.order_value` by trigger —
 * so neither can be typed by hand.
 */
export type OrderItemRow = Timestamps & {
  id: string
  order_id: string
  line_no: number
  description: string
  hsn_sac: string | null
  quantity: number
  unit: ItemUnit
  rate: number
  amount: number
  notes: string | null
  gst_rate: number
  /** Set only on a 0% line; cleared by trigger on any taxed line. */
  zero_rate_reason: string | null
  deleted_at: string | null
  created_by: string | null
}

export type PaymentRow = Timestamps & {
  id: string
  order_id: string
  amount: number
  paid_on: string
  mode: PaymentMode
  reference: string | null
  note: string | null
  deleted_at: string | null
  created_by: string | null
}

export type RndProjectRow = Timestamps & {
  id: string
  project_code: string | null
  project_name: string
  description: string | null
  approx_budget: number | null
  currency: CurrencyCode
  spent_to_date: number
  start_date: string | null
  target_date: string | null
  actual_end_date: string | null
  stage: RndStage
  lead_id: string | null
  progress_pct: number
  notes: string | null
  deleted_at: string | null
  created_by: string | null
}

export type RndExpenseRow = Timestamps & {
  id: string
  project_id: string
  amount: number
  currency: CurrencyCode
  spent_on: string
  kind: RndExpenseKind
  description: string
  vendor: string | null
  reference: string | null
  deleted_at: string | null
  created_by: string | null
}

export type WorkUpdateRow = Timestamps & {
  id: string
  parent_type: ParentKind
  parent_id: string
  update_date: string
  note: string
  progress_pct: number | null
  author_id: string | null
}

export type IpAssetRow = Timestamps & {
  id: string
  rnd_project_id: string | null
  title: string
  ip_type: IpType
  protection_route: IpRoute | null
  application_no: string | null
  registration_no: string | null
  jurisdiction: string
  status: IpStatus
  filing_date: string | null
  publication_date: string | null
  grant_date: string | null
  expiry_date: string | null
  next_renewal_date: string | null
  inventors: string[]
  owner_entity: string | null
  attorney_firm: string | null
  attorney_contact: string | null
  cost_to_date: number
  confidentiality: Confidentiality
  notes: string | null
  deleted_at: string | null
  created_by: string | null
}

export type IpEventRow = Timestamps & {
  id: string
  ip_asset_id: string
  event_date: string
  event_type: string
  due_date: string | null
  note: string | null
  cost: number | null
  author_id: string | null
}

export type ActivityLogRow = {
  id: number
  table_name: string
  row_id: string | null
  action: string
  actor_id: string | null
  diff: Json | null
  /** Plain-language description written by the log_activity trigger. */
  summary: string | null
  /** Reason supplied by whoever made the change, on noted operations only. */
  note: string | null
  status_from: string | null
  status_to: string | null
  created_at: string
}

/**
 * Staff-safe projection of the audit log. Never carries `diff`, and rows about
 * restricted IP assets are removed entirely rather than redacted.
 */
export type ActivityFeedRow = {
  id: number
  created_at: string
  table_name: string
  row_id: string | null
  action: string
  summary: string | null
  note: string | null
  /** Previous status on a status change. Lets timelines show history without the diff. */
  status_from: string | null
  status_to: string | null
  actor_id: string | null
  actor_name: string
}

/** Columns Postgres computes; never send them on insert or update. */
/* ---------------------------------------------------------------------------
 * Attendance (migration 20261009_9_01). Times of day are Postgres `time`
 * ("09:30:00"); punches are timestamptz in UTC and are read in IST.
 * ------------------------------------------------------------------------- */

export type AttendanceShiftRow = Timestamps & {
  id: string
  name: string
  start_time: string
  end_time: string
  grace_minutes: number
  half_day_minutes: number
  full_day_minutes: number
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  weekly_offs: number[]
  late_marks_per_half_day: number
  overtime_after_minutes: number
  is_default: boolean
}

export type AttendancePersonRow = Timestamps & {
  id: string
  profile_id: string
  device_code: string
  shift_id: string
  tracked_from: string
  is_active: boolean
  created_by: string | null
}

export type AttendanceDeviceStatus = 'pending' | 'active' | 'blocked'

export type AttendanceDeviceRow = Timestamps & {
  id: string
  serial_no: string
  name: string
  status: AttendanceDeviceStatus
  push_token: string
  token_required: boolean
  attlog_stamp: string | null
  last_seen_at: string | null
  last_ip: string | null
  last_info: string | null
}

export type PunchSource = 'device' | 'import' | 'manual' | 'correction'

export type AttendancePunchRow = {
  id: string
  person_id: string | null
  device_code: string
  punched_at: string
  source: PunchSource
  device_id: string | null
  verify_mode: number | null
  punch_state: number | null
  note: string | null
  created_by: string | null
  created_at: string
}

export type AttendanceHolidayRow = Timestamps & {
  id: string
  holiday_on: string
  name: string
  created_by: string | null
}

export type AttendanceLeaveTypeRow = Timestamps & {
  id: string
  code: string
  name: string
  is_paid: boolean
  counts_as_present: boolean
  yearly_quota: number | null
  is_active: boolean
  sort_order: number
}

export type AttendanceRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type AttendanceLeaveRow = Timestamps & {
  id: string
  person_id: string
  leave_type_id: string
  from_date: string
  to_date: string
  half_day: boolean
  reason: string | null
  status: AttendanceRequestStatus
  requested_by: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
}

export type AttendanceCorrectionRow = Timestamps & {
  id: string
  person_id: string
  work_date: string
  punch_in: string | null
  punch_out: string | null
  reason: string
  status: AttendanceRequestStatus
  requested_by: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
}

export type DayOverrideStatus =
  | 'present'
  | 'half_day'
  | 'absent'
  | 'leave'
  | 'on_duty'
  | 'holiday'
  | 'weekly_off'

export type AttendanceDayOverrideRow = Timestamps & {
  id: string
  person_id: string
  work_date: string
  status: DayOverrideStatus
  leave_type_id: string | null
  note: string
  created_by: string
}

type Generated = 'gst_amount' | 'total_with_gst' | 'balance_pending'

type Writable<T> = Omit<T, 'created_at' | 'updated_at'>
type InsertOf<T extends { id: string | number }> = Partial<Writable<T>>

export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: InsertOf<ProfileRow> & { id: string }; Update: InsertOf<ProfileRow>; Relationships: [] }
      roles: { Row: RoleRow; Insert: InsertOf<RoleRow> & { name: string }; Update: InsertOf<RoleRow>; Relationships: [] }
      role_features: { Row: RoleFeatureRow; Insert: RoleFeatureRow; Update: Partial<RoleFeatureRow>; Relationships: [] }
      tasks: {
        Row: TaskRow
        Insert: Omit<InsertOf<TaskRow>, 'completed_at'> & {
          parent_type: ParentKind
          parent_id: string
          title: string
          assigned_to: string
        }
        Update: Omit<InsertOf<TaskRow>, 'completed_at'>
        Relationships: []
      }
      companies: { Row: CompanyRow; Insert: InsertOf<CompanyRow> & { name: string }; Update: InsertOf<CompanyRow>; Relationships: [] }
      contacts: { Row: ContactRow; Insert: InsertOf<ContactRow> & { company_id: string; name: string }; Update: InsertOf<ContactRow>; Relationships: [] }
      inquiries: { Row: InquiryRow; Insert: InsertOf<InquiryRow> & { company_id: string }; Update: InsertOf<InquiryRow>; Relationships: [] }
      followups: { Row: FollowupRow; Insert: InsertOf<FollowupRow> & { inquiry_id: string; due_at: string }; Update: InsertOf<FollowupRow>; Relationships: [] }
      orders: {
        Row: OrderRow
        Insert: Omit<InsertOf<OrderRow>, Generated> & { inquiry_id: string; order_value: number }
        Update: Omit<InsertOf<OrderRow>, Generated>
        Relationships: []
      }
      order_items: {
        Row: OrderItemRow
        Insert: Omit<InsertOf<OrderItemRow>, 'amount'> & {
          order_id: string
          line_no: number
          description: string
          quantity: number
          rate: number
        }
        Update: Omit<InsertOf<OrderItemRow>, 'amount'>
        Relationships: []
      }
      qa_checks: { Row: QaCheckRow; Insert: InsertOf<QaCheckRow> & { order_id: string; description: string }; Update: InsertOf<QaCheckRow>; Relationships: [] }
      qa_media: { Row: QaMediaRow; Insert: Partial<QaMediaRow> & { qa_check_id: string; kind: QaMediaKind }; Update: Partial<QaMediaRow>; Relationships: [] }
      qualifications: { Row: QualificationRow; Insert: InsertOf<QualificationRow> & { order_id: string; stage: QualificationStage }; Update: InsertOf<QualificationRow>; Relationships: [] }
      meetings: { Row: MeetingRow; Insert: InsertOf<MeetingRow> & { subject: string }; Update: InsertOf<MeetingRow>; Relationships: [] }
      meeting_actions: { Row: MeetingActionRow; Insert: InsertOf<MeetingActionRow> & { meeting_id: string; action: string }; Update: InsertOf<MeetingActionRow>; Relationships: [] }
      company_settings: { Row: CompanySettingsRow; Insert: InsertOf<CompanySettingsRow>; Update: InsertOf<CompanySettingsRow>; Relationships: [] }
      installation_options: {
        Row: InstallationOptionRow
        Insert: Partial<InstallationOptionRow> & { label: string }
        Update: Partial<InstallationOptionRow>
        Relationships: []
      }
      invoices: { Row: InvoiceRow; Insert: InsertOf<InvoiceRow> & { doc_type: DocumentType; company_id: string }; Update: InsertOf<InvoiceRow>; Relationships: [] }
      invoice_lines: { Row: InvoiceLineRow; Insert: Partial<InvoiceLineRow>; Update: Partial<InvoiceLineRow>; Relationships: [] }
      payments: { Row: PaymentRow; Insert: InsertOf<PaymentRow> & { order_id: string; amount: number }; Update: InsertOf<PaymentRow>; Relationships: [] }
      rnd_projects: { Row: RndProjectRow; Insert: InsertOf<RndProjectRow> & { project_name: string }; Update: InsertOf<RndProjectRow>; Relationships: [] }
      rnd_expenses: { Row: RndExpenseRow; Insert: InsertOf<RndExpenseRow> & { project_id: string; amount: number; description: string }; Update: InsertOf<RndExpenseRow>; Relationships: [] }
      work_updates: { Row: WorkUpdateRow; Insert: InsertOf<WorkUpdateRow> & { parent_type: ParentKind; parent_id: string; note: string }; Update: InsertOf<WorkUpdateRow>; Relationships: [] }
      ip_assets: { Row: IpAssetRow; Insert: InsertOf<IpAssetRow> & { title: string; ip_type: IpType }; Update: InsertOf<IpAssetRow>; Relationships: [] }
      ip_events: { Row: IpEventRow; Insert: InsertOf<IpEventRow> & { ip_asset_id: string; event_type: string }; Update: InsertOf<IpEventRow>; Relationships: [] }
      activity_log: { Row: ActivityLogRow; Insert: Partial<ActivityLogRow>; Update: Partial<ActivityLogRow>; Relationships: [] }
      attendance_shifts: { Row: AttendanceShiftRow; Insert: Omit<InsertOf<AttendanceShiftRow>, 'is_default'> & { name: string; start_time: string; end_time: string }; Update: Omit<InsertOf<AttendanceShiftRow>, 'is_default'>; Relationships: [] }
      attendance_people: { Row: AttendancePersonRow; Insert: Omit<InsertOf<AttendancePersonRow>, 'created_by'> & { profile_id: string; device_code: string; shift_id: string }; Update: Pick<Partial<AttendancePersonRow>, 'device_code' | 'shift_id' | 'tracked_from' | 'is_active'>; Relationships: [] }
      attendance_devices: { Row: AttendanceDeviceRow; Insert: Pick<Partial<AttendanceDeviceRow>, 'name' | 'status' | 'token_required'> & { serial_no: string }; Update: Pick<Partial<AttendanceDeviceRow>, 'name' | 'status' | 'token_required'>; Relationships: [] }
      attendance_punches: { Row: AttendancePunchRow; Insert: never; Update: never; Relationships: [] }
      attendance_holidays: { Row: AttendanceHolidayRow; Insert: { holiday_on: string; name: string }; Update: { holiday_on?: string; name?: string }; Relationships: [] }
      attendance_leave_types: { Row: AttendanceLeaveTypeRow; Insert: Omit<InsertOf<AttendanceLeaveTypeRow>, 'id'> & { code: string; name: string }; Update: Omit<InsertOf<AttendanceLeaveTypeRow>, 'id' | 'code'>; Relationships: [] }
      attendance_leaves: { Row: AttendanceLeaveRow; Insert: { person_id: string; leave_type_id: string; from_date: string; to_date: string; half_day?: boolean; reason?: string | null }; Update: never; Relationships: [] }
      attendance_corrections: { Row: AttendanceCorrectionRow; Insert: { person_id: string; work_date: string; punch_in?: string | null; punch_out?: string | null; reason: string }; Update: never; Relationships: [] }
      attendance_day_overrides: { Row: AttendanceDayOverrideRow; Insert: { person_id: string; work_date: string; status: DayOverrideStatus; leave_type_id?: string | null; note: string }; Update: { status?: DayOverrideStatus; leave_type_id?: string | null; note?: string }; Relationships: [] }
    }
    Views: {
      activity_feed: { Row: ActivityFeedRow; Relationships: [] }
    }
    Functions: {
      is_active_member: { Args: Record<string, never>; Returns: boolean }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      /** Creates a draft document from an order, copying its line items. */
      create_document: {
        Args: {
          p_order_id: string
          p_doc_type: DocumentType
          p_doc_date?: string
          p_place_of_supply_code?: string | null
          p_place_of_supply_name?: string | null
          p_parent_invoice_id?: string | null
          p_notes?: string | null
          p_reason?: string | null
          p_valid_days?: number
        }
        Returns: string
      }
      /** Raises an empty draft quotation against an inquiry. */
      create_quotation: {
        Args: {
          p_inquiry_id: string
          p_doc_date?: string
          p_place_of_supply_code?: string | null
          p_place_of_supply_name?: string | null
          p_notes?: string | null
          p_valid_days?: number
        }
        Returns: string
      }
      /** Recalculates a DRAFT's totals after its lines are edited. */
      refresh_document_totals: { Args: { p_invoice_id: string }; Returns: void }
      /** Creates the order an accepted quotation becomes. Returns the order id. */
      accept_quotation: {
        Args: { p_quotation_id: string; p_technical_specification?: string | null }
        Returns: string
      }
      /** Allocates the number and freezes the snapshots. Returns the doc no. */
      issue_document: { Args: { p_invoice_id: string }; Returns: string }
      cancel_document: { Args: { p_invoice_id: string; p_reason: string }; Returns: undefined }
      /**
       * Rewrites the whole terms block on a draft in one call. Draft only;
       * raises otherwise. One call rather than six so the document is never
       * left holding half a set of terms.
       */
      set_document_terms: {
        Args: {
          p_invoice_id: string
          p_valid_days: number
          p_payment_terms?: string | null
          p_delivery_timeline?: string | null
          p_installation_scope?: string | null
          p_visit_rate?: number | null
          p_visit_count?: number | null
        }
        Returns: undefined
      }
      /**
       * Adds a scope to the installation dropdown and returns its label.
       * Adding one that already exists returns the existing label rather than
       * failing — two people typing the same scope is not an error.
       */
      add_installation_option: { Args: { p_label: string }; Returns: string }
      /** Copies a document into a fresh draft — no number, no snapshots. */
      duplicate_document: { Args: { p_invoice_id: string }; Returns: string }
      /**
       * Every statutory number that is not a live document: cancelled ones,
       * and genuine gaps where the counter issued a number no row accounts
       * for. Admin only — raises otherwise.
       */
      document_number_register: {
        Args: Record<string, never>
        Returns: DocumentNumberRegisterRow[]
      }
      /** Updates the spec and records the reason in one transaction. */
      update_order_spec: {
        Args: {
          p_order_id: string
          p_technical_specification: string | null
          p_addendum: string | null
          p_reason: string
        }
        Returns: undefined
      }
      attendance_decide_leave: { Args: { p_id: string; p_approve: boolean | null; p_note?: string | null }; Returns: undefined }
      attendance_decide_correction: { Args: { p_id: string; p_approve: boolean; p_note?: string | null }; Returns: undefined }
      attendance_cancel_request: { Args: { p_kind: 'leave' | 'correction'; p_id: string }; Returns: undefined }
      attendance_add_manual_punch: { Args: { p_person: string; p_at: string; p_note: string }; Returns: string }
      attendance_delete_punch: { Args: { p_id: string }; Returns: undefined }
      attendance_import_punches: {
        Args: { p_rows: { c: string; t: string }[]; p_label: string }
        Returns: { inserted: number; invalid: number; duplicates: number }
      }
      /** Anonymous: the fingerprint device's handshake (route /iclock/cdata). */
      attendance_device_hello: {
        Args: { p_serial: string; p_token: string | null; p_ip: string | null; p_info: string | null }
        Returns: { status: AttendanceDeviceStatus | 'rejected'; stamp?: string | null }
      }
      /** Anonymous: punches from the device. -1 when the device may not send. */
      attendance_device_push: {
        Args: {
          p_serial: string
          p_token: string | null
          p_ip: string | null
          p_stamp: string | null
          p_rows: { c: string; t: string; s?: string; v?: string }[]
        }
        Returns: number
      }
    }
    Enums: {
      company_type: CompanyType
      confidentiality: Confidentiality
      followup_channel: FollowupChannel
      inquiry_status: InquiryStatus
      ip_route: IpRoute
      ip_status: IpStatus
      ip_type: IpType
      qa_result: QaResult
      qa_media_kind: QaMediaKind
      qualification_stage: QualificationStage
      qualification_status: QualificationStatus
      meeting_type: MeetingType
      document_type: DocumentType
      document_status: DocumentStatus
      item_unit: ItemUnit
      order_status: OrderStatus
      parent_kind: ParentKind
      payment_mode: PaymentMode
      priority_level: PriorityLevel
      rnd_stage: RndStage
      rnd_expense_kind: RndExpenseKind
      user_role: UserRole
      task_status: TaskStatus
    }
    CompositeTypes: Record<string, never>
  }
}

/**
 * One row of the statutory number register.
 *
 * `kind` separates the two cases the panel must never blur together: a
 * `cancelled` number is normal and is reported as cancelled, while a `missing`
 * one means the counter handed out a number no document accounts for, which
 * should be impossible.
 */
export type DocumentNumberRegisterRow = {
  kind: 'cancelled' | 'missing'
  doc_type: DocumentType
  fy: string | null
  seq_number: number | null
  doc_no: string | null
  doc_date: string | null
  company_name: string | null
  cancelled_at: string | null
  cancelled_by_name: string | null
  cancel_reason: string | null
}
