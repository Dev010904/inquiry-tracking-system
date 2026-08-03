/**
 * Generated from the live Supabase schema (project vozvdtgsinocrohmasvq).
 * Regenerate after any migration with:  npm run db:types
 * Do not hand-edit.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type CompanyType = 'company' | 'school' | 'institution'
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

type Timestamps = { created_at: string; updated_at: string }

export type ProfileRow = Timestamps & {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: UserRole
  is_active: boolean
}

export type CompanyRow = Timestamps & {
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
  id: string
  order_no: string | null
  inquiry_id: string
  order_date: string
  po_number: string | null
  order_value: number
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
  created_at: string
}

/** Columns Postgres computes; never send them on insert or update. */
type Generated = 'gst_amount' | 'total_with_gst' | 'balance_pending'

type Writable<T> = Omit<T, 'created_at' | 'updated_at'>
type InsertOf<T extends { id: string | number }> = Partial<Writable<T>>

export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: InsertOf<ProfileRow> & { id: string }; Update: InsertOf<ProfileRow>; Relationships: [] }
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
      payments: { Row: PaymentRow; Insert: InsertOf<PaymentRow> & { order_id: string; amount: number }; Update: InsertOf<PaymentRow>; Relationships: [] }
      rnd_projects: { Row: RndProjectRow; Insert: InsertOf<RndProjectRow> & { project_name: string }; Update: InsertOf<RndProjectRow>; Relationships: [] }
      rnd_expenses: { Row: RndExpenseRow; Insert: InsertOf<RndExpenseRow> & { project_id: string; amount: number; description: string }; Update: InsertOf<RndExpenseRow>; Relationships: [] }
      work_updates: { Row: WorkUpdateRow; Insert: InsertOf<WorkUpdateRow> & { parent_type: ParentKind; parent_id: string; note: string }; Update: InsertOf<WorkUpdateRow>; Relationships: [] }
      ip_assets: { Row: IpAssetRow; Insert: InsertOf<IpAssetRow> & { title: string; ip_type: IpType }; Update: InsertOf<IpAssetRow>; Relationships: [] }
      ip_events: { Row: IpEventRow; Insert: InsertOf<IpEventRow> & { ip_asset_id: string; event_type: string }; Update: InsertOf<IpEventRow>; Relationships: [] }
      activity_log: { Row: ActivityLogRow; Insert: Partial<ActivityLogRow>; Update: Partial<ActivityLogRow>; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: {
      is_active_member: { Args: Record<string, never>; Returns: boolean }
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: {
      company_type: CompanyType
      confidentiality: Confidentiality
      followup_channel: FollowupChannel
      inquiry_status: InquiryStatus
      ip_route: IpRoute
      ip_status: IpStatus
      ip_type: IpType
      order_status: OrderStatus
      parent_kind: ParentKind
      payment_mode: PaymentMode
      priority_level: PriorityLevel
      rnd_stage: RndStage
      rnd_expense_kind: RndExpenseKind
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}
