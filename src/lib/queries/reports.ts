import 'server-only'

import { differenceInCalendarDays, format, subMonths } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { IpStatus, IpType } from '@/types/database'

export type MonthlyPoint = {
  /** '2026-08' */
  key: string
  /** 'Aug 26' */
  label: string
  inquiries: number
  orders: number
  orderValue: number
  /** Orders as a percentage of inquiries logged that month. */
  conversionPct: number | null
}

export type AgingBucket = {
  label: string
  count: number
  amount: number
}

export type LossReason = { reason: string; count: number }

export type ReportData = {
  monthly: MonthlyPoint[]
  totals: {
    inquiries: number
    won: number
    lost: number
    open: number
    conversionPct: number | null
    /** INR orders only, as is every money figure in this report. */
    orderValue: number
    outstanding: number
  }
  /** True when foreign-currency orders exist and are therefore left out of the money. */
  excludesForeignCurrency: boolean
  aging: AgingBucket[]
  lossReasons: LossReason[]
  ipByType: { type: IpType; count: number }[]
  ipByStatus: { status: IpStatus; count: number }[]
  ipCost: number
}

const MONTHS_BACK = 6

/**
 * Everything the reports page needs, in one pass.
 *
 * Conversion is measured by **cohort**: an order counts in the month its
 * inquiry was logged, not the month the order was placed. Otherwise a good
 * month for closing old leads would show over 100% conversion, which tells
 * you nothing useful.
 */
export async function getReportData(now = new Date()): Promise<ReportData> {
  const supabase = await createClient()
  const since = format(subMonths(now, MONTHS_BACK - 1), 'yyyy-MM-01')

  const [inquiriesRes, ordersRes, ipRes] = await Promise.all([
    supabase
      .from('inquiries')
      .select('id, inquiry_date, status, lost_reason, estimated_value')
      .is('deleted_at', null),
    supabase
      .from('orders')
      .select('inquiry_id, order_date, total_with_gst, balance_pending, order_status, currency')
      .is('deleted_at', null),
    supabase
      .from('ip_assets')
      .select('ip_type, status, cost_to_date')
      .is('deleted_at', null),
  ])

  const inquiries = inquiriesRes.data ?? []
  const orders = ordersRes.data ?? []
  const ipAssets = ipRes.data ?? []

  const orderByInquiry = new Map(orders.map((o) => [o.inquiry_id, o]))

  /*
   * Every money figure below counts INR orders only, and the report says so
   * when a foreign-currency order exists.
   *
   * Counts and conversion rates still cover the whole book — an order is an
   * order whatever it is priced in. Money is different: there is no exchange
   * rate on an order, so a chart adding rupees to dollars would be plotting a
   * quantity that does not exist.
   */
  const inrOrders = orders.filter((o) => o.currency === 'INR')
  const excludesForeignCurrency = inrOrders.length !== orders.length

  // ---- Monthly cohorts -----------------------------------------------------
  const buckets = new Map<string, MonthlyPoint>()
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const date = subMonths(now, i)
    const key = format(date, 'yyyy-MM')
    buckets.set(key, {
      key,
      label: format(date, 'MMM yy'),
      inquiries: 0,
      orders: 0,
      orderValue: 0,
      conversionPct: null,
    })
  }

  for (const inquiry of inquiries) {
    if (inquiry.inquiry_date < since) continue
    const key = inquiry.inquiry_date.slice(0, 7)
    const bucket = buckets.get(key)
    if (!bucket) continue

    bucket.inquiries += 1
    const order = orderByInquiry.get(inquiry.id)
    if (order) {
      bucket.orders += 1
      if (order.currency === 'INR') bucket.orderValue += Number(order.total_with_gst ?? 0)
    }
  }

  const monthly = [...buckets.values()].map((bucket) => ({
    ...bucket,
    conversionPct:
      bucket.inquiries > 0 ? Math.round((bucket.orders / bucket.inquiries) * 100) : null,
  }))

  // ---- Totals --------------------------------------------------------------
  const won = inquiries.filter((i) => i.status === 'confirmed').length
  const lost = inquiries.filter((i) => i.status === 'lost').length
  const open = inquiries.length - won - lost
  const decided = won + lost

  // ---- Payment aging -------------------------------------------------------
  // Aged from the order date, since there is no separate invoice date in the
  // model. Only orders with money still outstanding appear.
  const today = new Date(now.toISOString().slice(0, 10))
  const aging: AgingBucket[] = [
    { label: '0–30 days', count: 0, amount: 0 },
    { label: '31–60 days', count: 0, amount: 0 },
    { label: '61–90 days', count: 0, amount: 0 },
    { label: '90+ days', count: 0, amount: 0 },
  ]

  for (const order of inrOrders) {
    const balance = Number(order.balance_pending ?? 0)
    if (balance <= 0) continue
    const age = differenceInCalendarDays(today, new Date(order.order_date))
    const index = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3
    aging[index]!.count += 1
    aging[index]!.amount += balance
  }

  // ---- Loss reasons --------------------------------------------------------
  const reasonCounts = new Map<string, number>()
  for (const inquiry of inquiries) {
    if (inquiry.status !== 'lost') continue
    const reason = (inquiry.lost_reason ?? '').trim() || 'Not recorded'
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
  }
  const lossReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ---- IP ------------------------------------------------------------------
  const typeCounts = new Map<IpType, number>()
  const statusCounts = new Map<IpStatus, number>()
  for (const asset of ipAssets) {
    typeCounts.set(asset.ip_type, (typeCounts.get(asset.ip_type) ?? 0) + 1)
    statusCounts.set(asset.status, (statusCounts.get(asset.status) ?? 0) + 1)
  }

  return {
    monthly,
    totals: {
      inquiries: inquiries.length,
      won,
      lost,
      open,
      // Measured against decided inquiries — counting still-open leads as
      // losses would understate the rate.
      conversionPct: decided > 0 ? Math.round((won / decided) * 100) : null,
      orderValue: inrOrders.reduce((sum, o) => sum + Number(o.total_with_gst ?? 0), 0),
      outstanding: inrOrders.reduce((sum, o) => sum + Number(o.balance_pending ?? 0), 0),
    },
    excludesForeignCurrency,
    aging,
    lossReasons,
    ipByType: [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    ipByStatus: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    ipCost: ipAssets.reduce((sum, a) => sum + Number(a.cost_to_date ?? 0), 0),
  }
}
