import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { CompanyRow, CompanyType, ContactRow, InquiryRow, OrderRow } from '@/types/database'

export type CompanyCard = {
  id: string
  name: string
  type: CompanyType
  city: string | null
  state: string | null
  gstin: string | null
  gstApplicable: boolean
  contactCount: number
  primaryContact: ContactRow | null
  inquiryCount: number
  openInquiryCount: number
  orderCount: number
  /** Sum of total_with_gst across their orders — actual business won. */
  totalBusiness: number
  balancePending: number
  lastInquiryDate: string | null
}

const OPEN_STATUSES = ['new', 'in_discussion', 'quoted', 'negotiation', 'on_hold']

/**
 * Clients with their contacts and commercial totals.
 *
 * Orders reach a company through the inquiry, so the join is done in two hops
 * here rather than in SQL — PostgREST cannot express it in one call, and the
 * client list is small enough that three queries beat a database view we'd
 * then have to maintain.
 */
export async function listCompanies(search?: string): Promise<CompanyCard[]> {
  const supabase = await createClient()

  let query = supabase.from('companies').select('*').is('deleted_at', null).order('name')

  if (search) {
    const term = search.replace(/[,()*"\\]/g, ' ').trim()
    if (term) query = query.ilike('name', `%${term}%`)
  }

  const { data: companies } = await query
  if (!companies?.length) return []

  const companyIds = companies.map((c) => c.id)

  const [contactsRes, inquiriesRes] = await Promise.all([
    supabase.from('contacts').select('*').in('company_id', companyIds).is('deleted_at', null),
    supabase
      .from('inquiries')
      .select('id, company_id, status, inquiry_date')
      .in('company_id', companyIds)
      .is('deleted_at', null),
  ])

  const contacts = contactsRes.data ?? []
  const inquiries = inquiriesRes.data ?? []

  const { data: orders } = inquiries.length
    ? await supabase
        .from('orders')
        .select('inquiry_id, total_with_gst, balance_pending, currency')
        .in(
          'inquiry_id',
          inquiries.map((i) => i.id)
        )
        .is('deleted_at', null)
    : { data: [] as Pick<OrderRow, 'inquiry_id' | 'total_with_gst' | 'balance_pending' | 'currency'>[] }

  const inquiryCompany = new Map(inquiries.map((i) => [i.id, i.company_id]))

  const stats = new Map<
    string,
    { orders: number; business: number; balance: number }
  >()
  for (const order of orders ?? []) {
    const companyId = inquiryCompany.get(order.inquiry_id)
    if (!companyId) continue
    const entry = stats.get(companyId) ?? { orders: 0, business: 0, balance: 0 }
    entry.orders += 1
    // Money is INR only; an order carries no rate to convert with. The order
    // count above still covers every currency.
    if (order.currency === 'INR') {
      entry.business += Number(order.total_with_gst ?? 0)
      entry.balance += Number(order.balance_pending ?? 0)
    }
    stats.set(companyId, entry)
  }

  return companies.map((company) => {
    const own = contacts.filter((c) => c.company_id === company.id)
    const theirInquiries = inquiries.filter((i) => i.company_id === company.id)
    const stat = stats.get(company.id)

    const lastInquiryDate = theirInquiries
      .map((i) => i.inquiry_date)
      .sort()
      .pop()

    return {
      id: company.id,
      name: company.name,
      type: company.type,
      city: company.city,
      state: company.state,
      gstin: company.gstin,
      gstApplicable: company.gst_applicable,
      contactCount: own.length,
      primaryContact: own.find((c) => c.is_primary) ?? own[0] ?? null,
      inquiryCount: theirInquiries.length,
      openInquiryCount: theirInquiries.filter((i) => OPEN_STATUSES.includes(i.status)).length,
      orderCount: stat?.orders ?? 0,
      totalBusiness: stat?.business ?? 0,
      balancePending: stat?.balance ?? 0,
      lastInquiryDate: lastInquiryDate ?? null,
    }
  })
}

export type CompanyDetail = {
  company: CompanyRow
  card: CompanyCard
  contacts: ContactRow[]
  inquiries: InquiryRow[]
  orders: OrderRow[]
}

export async function getCompanyDetail(id: string): Promise<CompanyDetail | null> {
  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!company) return null

  const [contactsRes, inquiriesRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('*')
      .eq('company_id', id)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('name'),
    supabase
      .from('inquiries')
      .select('*')
      .eq('company_id', id)
      .is('deleted_at', null)
      .order('inquiry_date', { ascending: false }),
  ])

  const inquiries = inquiriesRes.data ?? []

  const { data: orders } = inquiries.length
    ? await supabase
        .from('orders')
        .select('*')
        .in(
          'inquiry_id',
          inquiries.map((i) => i.id)
        )
        .is('deleted_at', null)
        .order('order_date', { ascending: false })
    : { data: [] as OrderRow[] }

  const contacts = contactsRes.data ?? []
  const orderRows = orders ?? []

  // Totals are derived from the rows already fetched above rather than by
  // re-running the list query for one company.
  const card: CompanyCard = {
    id: company.id,
    name: company.name,
    type: company.type,
    city: company.city,
    state: company.state,
    gstin: company.gstin,
    gstApplicable: company.gst_applicable,
    contactCount: contacts.length,
    primaryContact: contacts.find((c) => c.is_primary) ?? contacts[0] ?? null,
    inquiryCount: inquiries.length,
    openInquiryCount: inquiries.filter((i) => OPEN_STATUSES.includes(i.status)).length,
    orderCount: orderRows.length,
    // INR only, as on the list — see listCompanies.
    totalBusiness: orderRows
      .filter((o) => o.currency === 'INR')
      .reduce((sum, o) => sum + Number(o.total_with_gst ?? 0), 0),
    balancePending: orderRows
      .filter((o) => o.currency === 'INR')
      .reduce((sum, o) => sum + Number(o.balance_pending ?? 0), 0),
    lastInquiryDate: inquiries[0]?.inquiry_date ?? null,
  }

  return { company, card, contacts, inquiries, orders: orderRows }
}
