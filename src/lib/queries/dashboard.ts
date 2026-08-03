import 'server-only'

import { addDays, differenceInCalendarDays, endOfDay, startOfDay, startOfMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { FOLLOWUP_LEAD_DAYS, IP_LEAD_DAYS } from '@/lib/constants'
import type {
  CompanyRow,
  ContactRow,
  FollowupChannel,
  InquiryRow,
  InquiryStatus,
} from '@/types/database'

export type AlarmBucket = 'overdue' | 'today' | 'upcoming'

export type FollowupAlarm = {
  kind: 'followup'
  id: string
  bucket: AlarmBucket
  /** snoozed_to when snoozed, otherwise due_at. This is what staff react to. */
  effectiveDue: string
  isSnoozed: boolean
  channel: FollowupChannel
  note: string
  inquiryId: string
  inquiryNo: string | null
  inquiryStatus: InquiryStatus
  companyName: string
  contactName: string | null
  contactPhone: string | null
  ownerName: string | null
}

export type IpAlarm = {
  kind: 'ip'
  id: string
  bucket: AlarmBucket
  effectiveDue: string
  title: string
  /** 'Renewal' or the event type, e.g. 'Office action reply'. */
  label: string
  assetId: string
  daysLeft: number
}

export type Alarms = {
  followups: { overdue: FollowupAlarm[]; today: FollowupAlarm[]; upcoming: FollowupAlarm[] }
  ip: IpAlarm[]
  overdueCount: number
}

export type Kpis = {
  openInquiries: number
  confirmedThisMonth: number
  orderValueMtd: number
  totalBalancePending: number
  overdueFollowups: number
}

export type RecentInquiry = {
  id: string
  inquiryNo: string | null
  inquiryDate: string
  status: InquiryStatus
  estimatedValue: number | null
  companyName: string
  companyType: CompanyRow['type'] | null
  contactName: string | null
  contactDesignation: string | null
  contactPhone: string | null
  contactEmail: string | null
  ownerName: string | null
  nextFollowupAt: string | null
}

/** Statuses that mean the inquiry is still live and needs attention. */
const OPEN_STATUSES: InquiryStatus[] = ['new', 'in_discussion', 'quoted', 'negotiation', 'on_hold']

/**
 * Pending follow-ups are read in one page rather than filtered in SQL on
 * `coalesce(snoozed_to, due_at)`, which PostgREST cannot express. With 3–10
 * staff the open set is in the tens; the cap is a safety valve, not a limit
 * we expect to hit.
 */
const PENDING_FOLLOWUP_CAP = 500

function bucketFor(due: Date, now: Date): AlarmBucket | null {
  if (due < startOfDay(now)) return 'overdue'
  if (due <= endOfDay(now)) return 'today'
  if (due <= endOfDay(addDays(now, FOLLOWUP_LEAD_DAYS))) return 'upcoming'
  return null
}

function indexBy<T extends { id: string }>(rows: T[] | null): Map<string, T> {
  return new Map((rows ?? []).map((row) => [row.id, row]))
}

/**
 * Everything the alarm panel needs: overdue / due today / next 7 days sales
 * follow-ups, plus IP deadlines at 90, 30 and 7 days. IP items sort above
 * sales follow-ups because a missed renewal cannot be recovered.
 */
export async function getAlarms(now = new Date()): Promise<Alarms> {
  const supabase = await createClient()

  const { data: pending } = await supabase
    .from('followups')
    .select('*')
    .eq('is_done', false)
    .order('due_at', { ascending: true })
    .limit(PENDING_FOLLOWUP_CAP)

  const relevant = (pending ?? [])
    .map((row) => {
      const effectiveDue = row.snoozed_to ?? row.due_at
      const bucket = bucketFor(new Date(effectiveDue), now)
      return bucket ? { row, effectiveDue, bucket } : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const inquiryIds = [...new Set(relevant.map((entry) => entry.row.inquiry_id))]

  const { data: inquiries } = inquiryIds.length
    ? await supabase.from('inquiries').select('*').in('id', inquiryIds)
    : { data: [] as InquiryRow[] }

  const companyIds = [...new Set((inquiries ?? []).map((i) => i.company_id))]
  const contactIds = [
    ...new Set((inquiries ?? []).map((i) => i.contact_id).filter((id): id is string => Boolean(id))),
  ]
  const ownerIds = [
    ...new Set((inquiries ?? []).map((i) => i.owner_id).filter((id): id is string => Boolean(id))),
  ]

  const [companiesRes, contactsRes, ownersRes] = await Promise.all([
    companyIds.length
      ? supabase.from('companies').select('*').in('id', companyIds)
      : Promise.resolve({ data: [] as CompanyRow[] }),
    contactIds.length
      ? supabase.from('contacts').select('*').in('id', contactIds)
      : Promise.resolve({ data: [] as ContactRow[] }),
    ownerIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ])

  const inquiryById = indexBy(inquiries)
  const companyById = indexBy(companiesRes.data)
  const contactById = indexBy(contactsRes.data)
  const ownerById = indexBy(ownersRes.data)

  const alarms: FollowupAlarm[] = relevant.map(({ row, effectiveDue, bucket }) => {
    const inquiry = inquiryById.get(row.inquiry_id)
    const company = inquiry ? companyById.get(inquiry.company_id) : undefined
    const contact = inquiry?.contact_id ? contactById.get(inquiry.contact_id) : undefined
    const owner = inquiry?.owner_id ? ownerById.get(inquiry.owner_id) : undefined

    return {
      kind: 'followup',
      id: row.id,
      bucket,
      effectiveDue,
      isSnoozed: Boolean(row.snoozed_to),
      channel: row.channel,
      note: row.note,
      inquiryId: row.inquiry_id,
      inquiryNo: inquiry?.inquiry_no ?? null,
      inquiryStatus: inquiry?.status ?? 'new',
      companyName: company?.name ?? 'Unknown company',
      contactName: contact?.name ?? null,
      contactPhone: contact?.phone ?? null,
      ownerName: owner?.full_name ?? null,
    }
  })

  const byDue = (a: { effectiveDue: string }, b: { effectiveDue: string }) =>
    a.effectiveDue.localeCompare(b.effectiveDue)

  return {
    followups: {
      overdue: alarms.filter((a) => a.bucket === 'overdue').sort(byDue),
      today: alarms.filter((a) => a.bucket === 'today').sort(byDue),
      upcoming: alarms.filter((a) => a.bucket === 'upcoming').sort(byDue),
    },
    ip: await getIpAlarms(now),
    overdueCount: alarms.filter((a) => a.bucket === 'overdue').length,
  }
}

/** IP renewals and open event due dates inside the widest lead window. */
async function getIpAlarms(now: Date): Promise<IpAlarm[]> {
  const supabase = await createClient()
  const maxLead = Math.max(...IP_LEAD_DAYS)
  const horizon = addDays(now, maxLead).toISOString().slice(0, 10)

  const [assetsRes, eventsRes] = await Promise.all([
    supabase
      .from('ip_assets')
      .select('id, title, next_renewal_date')
      .is('deleted_at', null)
      .not('next_renewal_date', 'is', null)
      .lte('next_renewal_date', horizon),
    supabase
      .from('ip_events')
      .select('id, ip_asset_id, event_type, due_date')
      .not('due_date', 'is', null)
      .lte('due_date', horizon),
  ])

  const eventAssetIds = [...new Set((eventsRes.data ?? []).map((e) => e.ip_asset_id))]
  const { data: eventAssets } = eventAssetIds.length
    ? await supabase.from('ip_assets').select('id, title').in('id', eventAssetIds)
    : { data: [] as { id: string; title: string }[] }
  const assetTitle = indexBy(eventAssets)

  const items: IpAlarm[] = []

  for (const asset of assetsRes.data ?? []) {
    const due = asset.next_renewal_date!
    items.push({
      kind: 'ip',
      id: `renewal:${asset.id}`,
      assetId: asset.id,
      title: asset.title,
      label: 'Renewal due',
      effectiveDue: due,
      daysLeft: differenceInCalendarDays(new Date(due), startOfDay(now)),
      bucket: 'overdue',
    })
  }

  for (const event of eventsRes.data ?? []) {
    const due = event.due_date!
    items.push({
      kind: 'ip',
      id: `event:${event.id}`,
      assetId: event.ip_asset_id,
      title: assetTitle.get(event.ip_asset_id)?.title ?? 'IP asset',
      label: event.event_type,
      effectiveDue: due,
      daysLeft: differenceInCalendarDays(new Date(due), startOfDay(now)),
      bucket: 'overdue',
    })
  }

  return items
    .map((item) => ({
      ...item,
      bucket: (item.daysLeft < 0 ? 'overdue' : item.daysLeft === 0 ? 'today' : 'upcoming') as AlarmBucket,
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/**
 * "Confirmed this month" and "order value MTD" are measured on `orders`, not
 * on inquiry status, because an order row is the point at which business is
 * actually booked. Value shown is inclusive of GST — it is what the client owes.
 */
export async function getKpis(overdueFollowups: number, now = new Date()): Promise<Kpis> {
  const supabase = await createClient()
  const monthStart = startOfMonth(now).toISOString().slice(0, 10)

  const [openRes, monthOrdersRes, allOrdersRes] = await Promise.all([
    supabase
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('status', OPEN_STATUSES),
    supabase
      .from('orders')
      .select('total_with_gst')
      .is('deleted_at', null)
      .gte('order_date', monthStart),
    supabase.from('orders').select('balance_pending').is('deleted_at', null),
  ])

  const monthOrders = monthOrdersRes.data ?? []

  return {
    openInquiries: openRes.count ?? 0,
    confirmedThisMonth: monthOrders.length,
    orderValueMtd: monthOrders.reduce((sum, o) => sum + Number(o.total_with_gst ?? 0), 0),
    totalBalancePending: (allOrdersRes.data ?? []).reduce(
      (sum, o) => sum + Number(o.balance_pending ?? 0),
      0
    ),
    overdueFollowups,
  }
}

/** Most recent inquiries with contact details and the next pending follow-up. */
export async function getRecentInquiries(limit = 8): Promise<RecentInquiry[]> {
  const supabase = await createClient()

  const { data: inquiries } = await supabase
    .from('inquiries')
    .select('*')
    .is('deleted_at', null)
    .order('inquiry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!inquiries?.length) return []

  const companyIds = [...new Set(inquiries.map((i) => i.company_id))]
  const contactIds = [
    ...new Set(inquiries.map((i) => i.contact_id).filter((id): id is string => Boolean(id))),
  ]
  const ownerIds = [
    ...new Set(inquiries.map((i) => i.owner_id).filter((id): id is string => Boolean(id))),
  ]
  const inquiryIds = inquiries.map((i) => i.id)

  const [companiesRes, contactsRes, ownersRes, followupsRes] = await Promise.all([
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
  ])

  const companyById = indexBy(companiesRes.data)
  const contactById = indexBy(contactsRes.data)
  const ownerById = indexBy(ownersRes.data)

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
      estimatedValue: inquiry.estimated_value,
      companyName: company?.name ?? 'Unknown company',
      companyType: company?.type ?? null,
      contactName: contact?.name ?? null,
      contactDesignation: contact?.designation ?? null,
      contactPhone: contact?.phone ?? null,
      contactEmail: contact?.email ?? null,
      ownerName: owner?.full_name ?? null,
      nextFollowupAt: nextFollowup.get(inquiry.id) ?? null,
    }
  })
}
