import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PAYMENT_MODE } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { activeFy } from '@/lib/fy-server'
import { getLedger } from '@/lib/queries/payments'
import { requireFeature } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Ledger · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

/**
 * The ledger — money received, and money still owed.
 *
 * This existed only inside a single order before, which meant the two
 * questions the owner actually asks ("what came in this year" and "who owes
 * us") had no answer anywhere in the app. Both are on one screen now, and the
 * screen is in the menu, so nobody has to be told where it lives.
 */
export default async function PaymentsPage() {
  await requireFeature('payments')

  const [fy, ledger] = await Promise.all([activeFy(), getLedger()])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Money received during {fy.fy}, and everything still owed — including what was carried
          in from earlier years.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
              Received in {fy.fy}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {ledger.receivedByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing received in this year yet.</p>
            ) : (
              ledger.receivedByCurrency.map((row) => (
                <div key={row.currency} className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    {row.count} payment{row.count === 1 ? '' : 's'}
                    {ledger.receivedByCurrency.length > 1 ? ` · ${row.currency}` : ''}
                  </span>
                  <span className="tnum text-lg font-semibold">
                    {formatMoney(row.total, row.currency, true)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Still owed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ledger.outstandingByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding. Every order is settled.</p>
            ) : (
              ledger.outstandingByCurrency.map((row) => (
                <div key={row.currency} className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">
                      Raised in {fy.fy}
                      {ledger.outstandingByCurrency.length > 1 ? ` · ${row.currency}` : ''}
                    </span>
                    <span className="tnum font-semibold">
                      {formatMoney(row.thisYear, row.currency, true)}
                    </span>
                  </div>
                  {/* Kept on its own line rather than folded into the figure above:
                      the two are owed under different years and a single total
                      would hide which. */}
                  {row.broughtForward > 0 && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">Brought forward</span>
                      <span className="tnum font-semibold text-overdue">
                        {formatMoney(row.broughtForward, row.currency, true)}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who owes what</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.outstanding.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody owes anything right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Client</th>
                    <th className="py-2 text-right font-medium">Raised in {fy.fy}</th>
                    <th className="py-2 text-right font-medium">Brought forward</th>
                    <th className="py-2 text-right font-medium">Total owed</th>
                    <th className="py-2 text-right font-medium">Orders</th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ledger.outstanding.map((row) => (
                    <tr key={`${row.companyId}:${row.currency}`} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        {row.companyName}
                        {ledger.outstandingByCurrency.length > 1 && (
                          <span className="ml-1 text-xs text-muted-foreground">{row.currency}</span>
                        )}
                      </td>
                      <td className="py-2 text-right tnum">
                        {formatMoney(row.thisYear, row.currency, true)}
                      </td>
                      <td className="py-2 text-right tnum">
                        {row.broughtForward > 0
                          ? formatMoney(row.broughtForward, row.currency, true)
                          : '—'}
                      </td>
                      <td className="py-2 text-right tnum font-semibold">
                        {formatMoney(row.total, row.currency, true)}
                      </td>
                      <td className="py-2 text-right tnum text-muted-foreground">
                        {row.orderCount}
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/companies/${row.companyId}`}
                          className="text-primary hover:underline"
                          aria-label={`Open ${row.companyName}`}
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments received in {fy.fy}</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments recorded in this year. They are entered against an order, on the order&rsquo;s
              own page.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Client</th>
                    <th className="py-2 font-medium">Order</th>
                    <th className="py-2 font-medium">Mode</th>
                    <th className="py-2 font-medium">Reference</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 whitespace-nowrap tnum">{formatDate(entry.paidOn)}</td>
                      <td className="py-2">{entry.companyName}</td>
                      <td className="py-2">
                        <Link
                          href={`/orders/${entry.orderId}`}
                          className="text-primary hover:underline"
                        >
                          {entry.orderNo ?? 'Order'}
                        </Link>
                      </td>
                      <td className="py-2 text-muted-foreground">{PAYMENT_MODE[entry.mode]}</td>
                      <td className="py-2 text-muted-foreground">{entry.reference || '—'}</td>
                      <td className="py-2 text-right tnum font-medium">
                        {formatMoney(entry.amount, entry.currency, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
