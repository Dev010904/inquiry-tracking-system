import { Card } from '@/components/ui/card'
import { CURRENCY } from '@/lib/constants'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CurrencyTotals, OrderSummary } from '@/lib/queries/orders'

function Tiles({ totals, showCurrencyLabel }: { totals: CurrencyTotals; showCurrencyLabel: boolean }) {
  const tiles = [
    { label: 'Total order value', hint: 'Excl. GST', value: totals.totalOrderValue },
    { label: 'Received', hint: 'Across the payments ledger', value: totals.totalReceived },
    {
      label: 'Outstanding',
      hint: 'Incl. GST',
      value: totals.totalOutstanding,
      alert: totals.totalOutstanding > 0,
    },
  ]

  return (
    <div className="space-y-1.5">
      {showCurrencyLabel && (
        <p className="text-xs font-medium text-muted-foreground">
          {CURRENCY[totals.currency]} · {totals.count} order{totals.count === 1 ? '' : 's'}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(({ label, hint, value, alert }) => (
          <Card key={label} className={cn('p-4', alert && 'border-overdue/40 bg-overdue/5')}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={cn('tnum mt-1 text-xl font-semibold', alert && 'text-overdue')}>
              {formatMoney(value, totals.currency)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

/**
 * Totals across every order matching the current filters — not just the
 * visible page. Filtering to "money outstanding" and reading this strip is
 * the fastest answer to "what are we owed".
 *
 * One row of tiles per currency, and no grand total across them. Rupees and
 * dollars added together would produce a confident-looking number that means
 * nothing, so the strip labels each block and leaves the arithmetic undone.
 * With a domestic-only book there is a single unlabelled block, as before.
 */
export function SummaryStrip({ summary }: { summary: OrderSummary }) {
  if (summary.byCurrency.length === 0) return null

  const mixed = summary.byCurrency.length > 1

  return (
    <div className="space-y-3">
      {summary.byCurrency.map((totals) => (
        <Tiles key={totals.currency} totals={totals} showCurrencyLabel={mixed} />
      ))}
      {mixed && (
        <p className="text-[11px] text-muted-foreground">
          Shown per currency. These are not added together — there is no exchange rate on an order,
          only on the document that invoices it.
        </p>
      )}
    </div>
  )
}
