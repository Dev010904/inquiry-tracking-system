import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { activeFy } from '@/lib/fy-server'
import { OPEN_ORDER_STATUSES } from '@/lib/constants'
import type {
  CompanyRow,
  ContactRow,
  CurrencyCode,
  InquiryRow,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  PaymentRow,
  WorkUpdateRow,
} from '@/types/database'

export const ORDERS_PAGE_SIZE = 20

export type OrderSort = 'date_desc' | 'date_asc' | 'balance_desc' | 'delivery_asc'

export type OrderFilters = {
  q?: string
  status?: OrderStatus
  /** Only orders with money still outstanding. */
  outstanding?: boolean
  from?: string
  to?: string
  sort?: OrderSort
  page?: number
}

export type OrderListRow = {
  id: string
  orderNo: string | null
  orderDate: string
  companyName: string
  inquiryNo: string | null
  orderValue: number
  currency: CurrencyCode
  gstAmount: number
  totalWithGst: number
  advanceReceived: number
  balancePending: number
  deliveryDate: string | null
  status: OrderStatus
  completionPct: number
  /** Delivery date has passed while the order is still open. */
  deliveryOverdue: boolean
}

export type CurrencyTotals = {
  currency: CurrencyCode
  totalOrderValue: number
  totalReceived: number
  totalOutstanding: number
  count: number
}

/**
 * Totals split by currency, never added across them.
 *
 * A single figure covering orders in rupees and dollars would be a number with
 * no meaning that still looks authoritative, which is worse than showing
 * nothing. `count` is the order count and is safe to total; the money is not.
 */
export type OrderSummary = {
  count: number
  byCurrency: CurrencyTotals[]
  /**
   * Money still owed on orders raised BEFORE the financial year on show.
   *
   * The lists reset on 1 April; a debt does not. An order invoiced in March and
   * paid in May is outstanding money the business is still chasing, and hiding
   * it because the year rolled over would misstate what is owed. Kept separate
   * from the year's own figures rather than folded into them, so neither number
   * has to be explained.
   */
  broughtForward: CurrencyTotals[]
}

export type OrderListResult = {
  rows: OrderListRow[]
  total: number
  page: number
  pageCount: number
  /** Totals across every order matching the filters, not just this page. */
  summary: OrderSummary
}

const SORT_COLUMN: Record<OrderSort, { column: string; ascending: boolean }> = {
  date_desc: { column: 'order_date', ascending: false },
  date_asc: { column: 'order_date', ascending: true },
  balance_desc: { column: 'balance_pending', ascending: false },
  delivery_asc: { column: 'delivery_date', ascending: true },
}

function indexBy<T extends { id: string }>(rows: T[] | null | undefined): Map<string, T> {
  return new Map((rows ?? []).map((row) => [row.id, row]))
}

function sanitiseSearch(term: string): string {
  return term.replace(/[,()*"\\]/g, ' ').trim()
}

/** Delivery is late only while the order is still open — a closed one cannot slip. */
export function isDeliveryOverdue(
  deliveryDate: string | null,
  status: OrderStatus,
  now = new Date()
): boolean {
  if (!deliveryDate) return false
  if (!OPEN_ORDER_STATUSES.includes(status)) return false
  return new Date(deliveryDate) < new Date(now.toISOString().slice(0, 10))
}

/**
 * Filtered order list plus summary totals.
 *
 * The summary is computed over every matching order, not the current page —
 * "total outstanding" that only counted 20 rows would be actively misleading.
 * It is a separate lightweight query selecting three numeric columns.
 */
type MoneyRow = {
  order_value: number | string | null
  advance_received: number | string | null
  balance_pending: number | string | null
  currency: string | null
}

/**
 * Totals grouped by currency, INR first.
 *
 * Shared by the year's own figures and by the brought-forward ones so the two
 * can never drift into counting differently — the bug that would be hardest to
 * spot, because both numbers would still look plausible.
 */
function totalsFor(rows: MoneyRow[]): CurrencyTotals[] {
  const byCurrency = new Map<CurrencyCode, CurrencyTotals>()
  for (const row of rows) {
    const currency = (row.currency ?? 'INR') as CurrencyCode
    const bucket =
      byCurrency.get(currency) ??
      { currency, totalOrderValue: 0, totalReceived: 0, totalOutstanding: 0, count: 0 }
    bucket.totalOrderValue += Number(row.order_value ?? 0)
    bucket.totalReceived += Number(row.advance_received ?? 0)
    bucket.totalOutstanding += Number(row.balance_pending ?? 0)
    bucket.count += 1
    byCurrency.set(currency, bucket)
  }
  // The domestic book is what staff read first.
  return [...byCurrency.values()].sort((a, b) =>
    a.currency === 'INR' ? -1 : b.currency === 'INR' ? 1 : b.totalOrderValue - a.totalOrderValue
  )
}

export async function listOrders(filters: OrderFilters): Promise<OrderListResult> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)
  const sort = SORT_COLUMN[filters.sort ?? 'date_desc']

  // Search matches the order number directly, or any order belonging to a
  // company whose name matches.
  let inquiryIdMatches: string[] | null = null
  const term = filters.q ? sanitiseSearch(filters.q) : ''

  if (term) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id')
      .is('deleted_at', null)
      .ilike('name', `%${term}%`)
      .limit(200)

    const companyIds = (companies ?? []).map((c) => c.id)
    if (companyIds.length) {
      const { data: inquiries } = await supabase
        .from('inquiries')
        .select('id')
        .in('company_id', companyIds)
        .limit(500)
      inquiryIdMatches = (inquiries ?? []).map((i) => i.id)
    } else {
      inquiryIdMatches = []
    }
  }

  const orClauses = term
    ? [
        `order_no.ilike.%${term}%`,
        ...(inquiryIdMatches?.length ? [`inquiry_id.in.(${inquiryIdMatches.join(',')})`] : []),
      ].join(',')
    : null

  const fromRow = (page - 1) * ORDERS_PAGE_SIZE

  const fy = await activeFy()

  // Both the list and its totals are scoped to the financial year on show, so
  // the figures under the table always describe the rows in it.
  let listQuery = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .gte('order_date', fy.from)
    .lte('order_date', fy.to)

  let summaryQuery = supabase
    .from('orders')
    .select('order_value, advance_received, balance_pending, currency')
    .is('deleted_at', null)
    .gte('order_date', fy.from)
    .lte('order_date', fy.to)

  // Deliberately NOT scoped forward: everything still unpaid from an earlier
  // year, whatever year that was.
  const broughtForwardQuery = supabase
    .from('orders')
    .select('order_value, advance_received, balance_pending, currency')
    .is('deleted_at', null)
    .lt('order_date', fy.from)
    .gt('balance_pending', 0)

  if (filters.status) {
    listQuery = listQuery.eq('order_status', filters.status)
    summaryQuery = summaryQuery.eq('order_status', filters.status)
  }
  if (filters.outstanding) {
    listQuery = listQuery.gt('balance_pending', 0)
    summaryQuery = summaryQuery.gt('balance_pending', 0)
  }
  if (filters.from) {
    listQuery = listQuery.gte('order_date', filters.from)
    summaryQuery = summaryQuery.gte('order_date', filters.from)
  }
  if (filters.to) {
    listQuery = listQuery.lte('order_date', filters.to)
    summaryQuery = summaryQuery.lte('order_date', filters.to)
  }
  if (orClauses) {
    listQuery = listQuery.or(orClauses)
    summaryQuery = summaryQuery.or(orClauses)
  }

  const [listRes, summaryRes, broughtRes] = await Promise.all([
    listQuery
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(fromRow, fromRow + ORDERS_PAGE_SIZE - 1),
    summaryQuery,
    broughtForwardQuery,
  ])

  const orders = listRes.data ?? []
  const total = listRes.count ?? 0
  const summaryRows = summaryRes.data ?? []

  const summary: OrderSummary = {
    count: summaryRows.length,
    broughtForward: totalsFor(broughtRes.data ?? []),
    byCurrency: totalsFor(summaryRows),
  }

  if (orders.length === 0) {
    return { rows: [], total, page, pageCount: Math.ceil(total / ORDERS_PAGE_SIZE), summary }
  }

  // Company name reaches orders through the inquiry, so both hops are resolved
  // in two queries rather than per row.
  const inquiryIds = [...new Set(orders.map((o) => o.inquiry_id))]
  const { data: inquiries } = await supabase
    .from('inquiries')
    .select('id, inquiry_no, company_id')
    .in('id', inquiryIds)

  const companyIds = [...new Set((inquiries ?? []).map((i) => i.company_id))]
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, name').in('id', companyIds)
    : { data: [] as { id: string; name: string }[] }

  const inquiryById = indexBy(inquiries)
  const companyById = indexBy(companies)

  const rows: OrderListRow[] = orders.map((order) => {
    const inquiry = inquiryById.get(order.inquiry_id)
    const company = inquiry ? companyById.get(inquiry.company_id) : undefined

    return {
      id: order.id,
      orderNo: order.order_no,
      orderDate: order.order_date,
      companyName: company?.name ?? 'Unknown company',
      inquiryNo: inquiry?.inquiry_no ?? null,
      orderValue: Number(order.order_value ?? 0),
      currency: order.currency,
      gstAmount: Number(order.gst_amount ?? 0),
      totalWithGst: Number(order.total_with_gst ?? 0),
      advanceReceived: Number(order.advance_received ?? 0),
      balancePending: Number(order.balance_pending ?? 0),
      deliveryDate: order.delivery_date,
      status: order.order_status,
      completionPct: order.completion_pct,
      deliveryOverdue: isDeliveryOverdue(order.delivery_date, order.order_status),
    }
  })

  return { rows, total, page, pageCount: Math.ceil(total / ORDERS_PAGE_SIZE), summary }
}

export type OrderDetail = {
  order: OrderRow
  inquiry: InquiryRow | null
  company: CompanyRow | null
  contact: ContactRow | null
  items: OrderItemRow[]
  payments: PaymentRow[]
  workUpdates: (WorkUpdateRow & { authorName: string | null })[]
  deliveryOverdue: boolean
}

async function loadOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!order) return null

  const [inquiryRes, itemsRes, paymentsRes, updatesRes] = await Promise.all([
    supabase.from('inquiries').select('*').eq('id', order.inquiry_id).maybeSingle(),
    supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .is('deleted_at', null)
      .order('line_no', { ascending: true }),
    supabase
      .from('payments')
      .select('*')
      .eq('order_id', id)
      .is('deleted_at', null)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('work_updates')
      .select('*')
      .eq('parent_type', 'order')
      .eq('parent_id', id)
      .order('update_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  const inquiry = inquiryRes.data ?? null

  const [companyRes, contactRes] = await Promise.all([
    inquiry
      ? supabase.from('companies').select('*').eq('id', inquiry.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    inquiry?.contact_id
      ? supabase.from('contacts').select('*').eq('id', inquiry.contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const updates = updatesRes.data ?? []
  const authorIds = [
    ...new Set(updates.map((u) => u.author_id).filter((v): v is string => Boolean(v))),
  ]
  const { data: authors } = authorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] as { id: string; full_name: string }[] }
  const authorById = indexBy(authors)

  return {
    order,
    inquiry,
    company: companyRes.data ?? null,
    contact: contactRes.data ?? null,
    items: itemsRes.data ?? [],
    payments: paymentsRes.data ?? [],
    workUpdates: updates.map((update) => ({
      ...update,
      authorName: update.author_id ? (authorById.get(update.author_id)?.full_name ?? null) : null,
    })),
    deliveryOverdue: isDeliveryOverdue(order.delivery_date, order.order_status),
  }
}

/**
 * Cached for the request. The page's generateMetadata and the page itself both
 * ask for the same record, and every one of these loaders is several queries —
 * without this the whole set ran twice on every visit.
 */
export const getOrderDetail = cache(loadOrderDetail)
