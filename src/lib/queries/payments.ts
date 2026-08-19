import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { activeFy } from '@/lib/fy-server'
import type { CurrencyCode, PaymentMode } from '@/types/database'

export type LedgerEntry = {
  id: string
  paidOn: string
  amount: number
  mode: PaymentMode
  reference: string | null
  note: string | null
  orderId: string
  orderNo: string | null
  companyName: string
  currency: CurrencyCode
}

export type OutstandingRow = {
  companyId: string
  companyName: string
  currency: CurrencyCode
  /** Owed on orders raised inside the year on show. */
  thisYear: number
  /** Owed on orders raised before it, and still unpaid. */
  broughtForward: number
  total: number
  orderCount: number
}

export type Ledger = {
  entries: LedgerEntry[]
  /** Received during the year on show, per currency. */
  receivedByCurrency: { currency: CurrencyCode; total: number; count: number }[]
  outstanding: OutstandingRow[]
  outstandingByCurrency: { currency: CurrencyCode; thisYear: number; broughtForward: number }[]
}

/**
 * The ledger: money in, and money still owed.
 *
 * Two halves that answer two different questions, and they are deliberately
 * scoped differently:
 *
 *   * What came in — the payments recorded during the financial year on show.
 *     A receipts figure only means anything against a stated period.
 *   * What is still owed — every unpaid order, whatever year it was raised in,
 *     split into this year's and what was carried into it. A receivables
 *     figure that quietly dropped last year's unpaid invoices on 1 April would
 *     understate the debt on the one screen built to state it.
 *
 * Everything is grouped by currency and never added across currencies: an
 * order carries no exchange rate, so a single total spanning rupees and
 * dollars would be a confident number describing nothing.
 */
export async function getLedger(): Promise<Ledger> {
  const supabase = await createClient()
  const fy = await activeFy()

  const [paymentsRes, ordersRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id, order_id, amount, paid_on, mode, reference, note')
      .is('deleted_at', null)
      .gte('paid_on', fy.from)
      .lte('paid_on', fy.to)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),
    // Not scoped: what is owed does not restart with the year.
    supabase
      .from('orders')
      .select('id, order_no, inquiry_id, order_date, balance_pending, currency')
      .is('deleted_at', null),
  ])

  const payments = paymentsRes.data ?? []
  const orders = ordersRes.data ?? []

  // Company name reaches an order through its inquiry, so both hops are
  // resolved in two queries rather than one per row.
  const inquiryIds = [...new Set(orders.map((o) => o.inquiry_id))]
  const { data: inquiries } = inquiryIds.length
    ? await supabase.from('inquiries').select('id, company_id').in('id', inquiryIds)
    : { data: [] as { id: string; company_id: string }[] }

  const companyIds = [...new Set((inquiries ?? []).map((i) => i.company_id))]
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, name').in('id', companyIds)
    : { data: [] as { id: string; name: string }[] }

  const companyOfInquiry = new Map((inquiries ?? []).map((i) => [i.id, i.company_id]))
  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]))
  const orderById = new Map(orders.map((o) => [o.id, o]))

  const entries: LedgerEntry[] = payments.map((p) => {
    const order = orderById.get(p.order_id)
    const companyId = order ? companyOfInquiry.get(order.inquiry_id) : undefined
    return {
      id: p.id,
      paidOn: p.paid_on,
      amount: Number(p.amount ?? 0),
      mode: p.mode as PaymentMode,
      reference: p.reference,
      note: p.note,
      orderId: p.order_id,
      orderNo: order?.order_no ?? null,
      companyName: (companyId && companyName.get(companyId)) || 'Unknown client',
      currency: (order?.currency ?? 'INR') as CurrencyCode,
    }
  })

  const received = new Map<CurrencyCode, { currency: CurrencyCode; total: number; count: number }>()
  for (const entry of entries) {
    const bucket = received.get(entry.currency) ?? { currency: entry.currency, total: 0, count: 0 }
    bucket.total += entry.amount
    bucket.count += 1
    received.set(entry.currency, bucket)
  }

  const byClient = new Map<string, OutstandingRow>()
  const owedTotals = new Map<
    CurrencyCode,
    { currency: CurrencyCode; thisYear: number; broughtForward: number }
  >()

  for (const order of orders) {
    const owed = Number(order.balance_pending ?? 0)
    if (owed <= 0) continue

    const companyId = companyOfInquiry.get(order.inquiry_id)
    if (!companyId) continue
    const currency = (order.currency ?? 'INR') as CurrencyCode
    const isPrior = (order.order_date ?? '') < fy.from
    const key = `${companyId}:${currency}`

    const row =
      byClient.get(key) ??
      {
        companyId,
        companyName: companyName.get(companyId) ?? 'Unknown client',
        currency,
        thisYear: 0,
        broughtForward: 0,
        total: 0,
        orderCount: 0,
      }
    if (isPrior) row.broughtForward += owed
    else row.thisYear += owed
    row.total += owed
    row.orderCount += 1
    byClient.set(key, row)

    const totals =
      owedTotals.get(currency) ?? { currency, thisYear: 0, broughtForward: 0 }
    if (isPrior) totals.broughtForward += owed
    else totals.thisYear += owed
    owedTotals.set(currency, totals)
  }

  const inrFirst = <T extends { currency: CurrencyCode }>(rows: T[]) =>
    rows.sort((a, b) => (a.currency === 'INR' ? -1 : b.currency === 'INR' ? 1 : 0))

  return {
    entries,
    receivedByCurrency: inrFirst([...received.values()]),
    // Biggest debt first — the list is read to decide who to chase.
    outstanding: [...byClient.values()].sort((a, b) => b.total - a.total),
    outstandingByCurrency: inrFirst([...owedTotals.values()]),
  }
}
