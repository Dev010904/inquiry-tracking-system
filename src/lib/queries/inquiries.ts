import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  ActivityFeedRow,
  CompanyRow,
  CompanyType,
  ContactRow,
  FollowupRow,
  InquiryRow,
  InquiryStatus,
  OrderRow,
  PriorityLevel,
} from '@/types/database'

export const PAGE_SIZE = 20

export type InquirySort = 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc'

export type InquiryFilters = {
  q?: string
  status?: InquiryStatus[]
  companyType?: CompanyType
  ownerId?: string
  from?: string
  to?: string
  sort?: InquirySort
  page?: number
}

export type InquiryListRow = {
  id: string
  inquiryNo: string | null
  inquiryDate: string
  status: InquiryStatus
  priority: PriorityLevel
  estimatedValue: number | null
  requirementSummary: string
  companyId: string
  companyName: string
  companyType: CompanyType | null
  contactName: string | null
  contactDesignation: string | null
  contactPhone: string | null
  contactEmail: string | null
  ownerName: string | null
  nextFollowupAt: string | null
  hasOrder: boolean
}

export type InquiryListResult = {
  rows: InquiryListRow[]
  total: number
  page: number
  pageCount: number
}

const SORT_COLUMN: Record<InquirySort, { column: string; ascending: boolean }> = {
  date_desc: { column: 'inquiry_date', ascending: false },
  date_asc: { column: 'inquiry_date', ascending: true },
  value_desc: { column: 'estimated_value', ascending: false },
  value_asc: { column: 'estimated_value', ascending: true },
}

function indexBy<T extends { id: string }>(rows: T[] | null | undefined): Map<string, T> {
  return new Map((rows ?? []).map((row) => [row.id, row]))
}

/** PostgREST treats these as syntax inside or() — strip rather than escape. */
function sanitiseSearch(term: string): string {
  return term.replace(/[,()*"\\]/g, ' ').trim()
}

/**
 * Filtered, sorted, paginated inquiry list.
 *
 * Free-text search covers the inquiry number, the requirement summary and the
 * company name. Company name lives on another table, so it is resolved to a
 * set of company ids first and folded into the same `or()` — one round trip
 * for the match rather than a second pass over the results.
 */
export async function listInquiries(filters: InquiryFilters): Promise<InquiryListResult> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)
  const sort = SORT_COLUMN[filters.sort ?? 'date_desc']

  let companyIdMatches: string[] | null = null

  if (filters.q) {
    const term = sanitiseSearch(filters.q)
    if (term) {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .is('deleted_at', null)
        .ilike('name', `%${term}%`)
        .limit(200)
      companyIdMatches = (data ?? []).map((row) => row.id)
    }
  }

  // Company-type filter narrows to that set of companies up front.
  let typeCompanyIds: string[] | null = null
  if (filters.companyType) {
    const { data } = await supabase
      .from('companies')
      .select('id')
      .is('deleted_at', null)
      .eq('type', filters.companyType)
    typeCompanyIds = (data ?? []).map((row) => row.id)
    if (typeCompanyIds.length === 0) {
      return { rows: [], total: 0, page: 1, pageCount: 0 }
    }
  }

  let query = supabase
    .from('inquiries')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)

  if (filters.status?.length) query = query.in('status', filters.status)
  if (typeCompanyIds) query = query.in('company_id', typeCompanyIds)
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId)
  if (filters.from) query = query.gte('inquiry_date', filters.from)
  if (filters.to) query = query.lte('inquiry_date', filters.to)

  if (filters.q) {
    const term = sanitiseSearch(filters.q)
    if (term) {
      const clauses = [`inquiry_no.ilike.%${term}%`, `requirement_summary.ilike.%${term}%`]
      if (companyIdMatches?.length) clauses.push(`company_id.in.(${companyIdMatches.join(',')})`)
      query = query.or(clauses.join(','))
    }
  }

  const fromRow = (page - 1) * PAGE_SIZE
  const { data, count } = await query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(fromRow, fromRow + PAGE_SIZE - 1)

  const inquiries = data ?? []
  const total = count ?? 0

  if (inquiries.length === 0) {
    return { rows: [], total, page, pageCount: Math.ceil(total / PAGE_SIZE) }
  }

  const rows = await decorate(inquiries)
  return { rows, total, page, pageCount: Math.ceil(total / PAGE_SIZE) }
}

/** Attaches company, contact, owner, next follow-up and order presence. */
async function decorate(inquiries: InquiryRow[]): Promise<InquiryListRow[]> {
  const supabase = await createClient()

  const companyIds = [...new Set(inquiries.map((i) => i.company_id))]
  const contactIds = [
    ...new Set(inquiries.map((i) => i.contact_id).filter((id): id is string => Boolean(id))),
  ]
  const ownerIds = [
    ...new Set(inquiries.map((i) => i.owner_id).filter((id): id is string => Boolean(id))),
  ]
  const inquiryIds = inquiries.map((i) => i.id)

  const [companiesRes, contactsRes, ownersRes, followupsRes, ordersRes] = await Promise.all([
    supabase.from('companies').select('*').in('id', companyIds),
    contactIds.length
      ? supabase.from('contacts').select('*').in('id', contactIds)
      : Promise.resolve({ data: [] as ContactRow[] }),
    ownerIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase
      .from('followups')
      .select('inquiry_id, due_at, snoozed_to')
      .eq('is_done', false)
      .in('inquiry_id', inquiryIds),
    supabase.from('orders').select('inquiry_id').is('deleted_at', null).in('inquiry_id', inquiryIds),
  ])

  const companyById = indexBy(companiesRes.data)
  const contactById = indexBy(contactsRes.data)
  const ownerById = indexBy(ownersRes.data)
  const orderedInquiryIds = new Set((ordersRes.data ?? []).map((o) => o.inquiry_id))

  const nextFollowup = new Map<string, string>()
  for (const row of followupsRes.data ?? []) {
    const due = row.snoozed_to ?? row.due_at
    const current = nextFollowup.get(row.inquiry_id)
    if (!current || due < current) nextFollowup.set(row.inquiry_id, due)
  }

  return inquiries.map((inquiry) => {
    const company = companyById.get(inquiry.company_id)
    const contact = inquiry.contact_id ? contactById.get(inquiry.contact_id) : undefined
    const owner = inquiry.owner_id ? ownerById.get(inquiry.owner_id) : undefined

    return {
      id: inquiry.id,
      inquiryNo: inquiry.inquiry_no,
      inquiryDate: inquiry.inquiry_date,
      status: inquiry.status,
      priority: inquiry.priority,
      estimatedValue: inquiry.estimated_value,
      requirementSummary: inquiry.requirement_summary,
      companyId: inquiry.company_id,
      companyName: company?.name ?? 'Unknown company',
      companyType: company?.type ?? null,
      contactName: contact?.name ?? null,
      contactDesignation: contact?.designation ?? null,
      contactPhone: contact?.phone ?? null,
      contactEmail: contact?.email ?? null,
      ownerName: owner?.full_name ?? null,
      nextFollowupAt: nextFollowup.get(inquiry.id) ?? null,
      hasOrder: orderedInquiryIds.has(inquiry.id),
    }
  })
}

export type TimelineEntry = {
  id: string
  at: string
  kind: 'created' | 'status' | 'followup_due' | 'followup_done' | 'note' | 'order'
  title: string
  detail?: string
  actor?: string | null
}

export type InquiryDetail = {
  inquiry: InquiryRow
  company: CompanyRow | null
  contact: ContactRow | null
  contacts: ContactRow[]
  ownerName: string | null
  followups: FollowupRow[]
  order: OrderRow | null
  timeline: TimelineEntry[]
}

/** Full detail plus a merged chronological timeline. Returns null if not found. */
export async function getInquiryDetail(id: string): Promise<InquiryDetail | null> {
  const supabase = await createClient()

  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!inquiry) return null

  const [companyRes, contactsRes, followupsRes, orderRes, activityRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', inquiry.company_id).maybeSingle(),
    supabase
      .from('contacts')
      .select('*')
      .eq('company_id', inquiry.company_id)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('name'),
    supabase.from('followups').select('*').eq('inquiry_id', id).order('due_at', { ascending: true }),
    supabase.from('orders').select('*').eq('inquiry_id', id).is('deleted_at', null).maybeSingle(),
    // Read the feed view, never activity_log itself. The raw table carries a
    // full before/after diff of every change — including rows belonging to
    // restricted IP assets — and is not granted to the application at all.
    // Status history comes from the structured columns instead.
    supabase
      .from('activity_feed')
      .select('*')
      .eq('table_name', 'inquiries')
      .eq('row_id', id)
      .order('created_at', { ascending: true })
      .limit(100),
  ])

  const owner = inquiry.owner_id
    ? await supabase.from('profiles').select('full_name').eq('id', inquiry.owner_id).maybeSingle()
    : null

  const contacts = contactsRes.data ?? []
  const followups = followupsRes.data ?? []

  return {
    inquiry,
    company: companyRes.data ?? null,
    contact: contacts.find((c) => c.id === inquiry.contact_id) ?? null,
    contacts,
    ownerName: owner?.data?.full_name ?? null,
    followups,
    order: orderRes.data ?? null,
    timeline: buildTimeline(inquiry, followups, activityRes.data ?? [], orderRes.data ?? null),
  }
}

/**
 * Merges three sources into one dated list: the audit log (status changes),
 * follow-ups (both scheduled and completed) and the order, if one exists.
 * Newest first — staff open this to see what just happened.
 */
function buildTimeline(
  inquiry: InquiryRow,
  followups: FollowupRow[],
  activity: ActivityFeedRow[],
  order: OrderRow | null
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `created:${inquiry.id}`,
      at: inquiry.created_at,
      kind: 'created',
      title: 'Inquiry logged',
      detail: inquiry.inquiry_no ?? undefined,
    },
  ]

  // Status history comes from the structured columns the audit trigger writes,
  // not from the diff. Staff can read these; the diff itself is granted to
  // nobody, so a timeline can never become a way to see restricted detail.
  for (const row of activity) {
    if (row.action === 'update' && row.status_to) {
      entries.push({
        id: `activity:${row.id}`,
        at: row.created_at,
        kind: 'status',
        title: `Status → ${row.status_to.replace(/_/g, ' ')}`,
        detail: row.status_from ? `was ${row.status_from.replace(/_/g, ' ')}` : undefined,
        actor: row.actor_name,
      })
    }
  }

  for (const followup of followups) {
    entries.push({
      id: `fu:${followup.id}`,
      at: followup.created_at,
      kind: 'followup_due',
      title: `Follow-up scheduled (${followup.channel})`,
      detail: followup.note,
    })
    if (followup.is_done && followup.done_at) {
      entries.push({
        id: `fud:${followup.id}`,
        at: followup.done_at,
        kind: 'followup_done',
        title: 'Follow-up completed',
        detail: followup.outcome ?? followup.note,
      })
    }
  }

  if (order) {
    entries.push({
      id: `order:${order.id}`,
      at: order.created_at,
      kind: 'order',
      title: `Converted to order ${order.order_no ?? ''}`.trim(),
    })
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at))
}

/** Companies and active staff, for the form pickers. */
export async function getFormOptions() {
  const supabase = await createClient()

  const [companiesRes, profilesRes] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, type, city')
      .is('deleted_at', null)
      .order('name')
      .limit(1000),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  return {
    companies: companiesRes.data ?? [],
    staff: profilesRes.data ?? [],
  }
}

/** Contacts for one company — used when the company picker changes. */
export async function getCompanyContacts(companyId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contacts')
    .select('id, name, phone, email, designation, is_primary')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('name')
  return data ?? []
}
