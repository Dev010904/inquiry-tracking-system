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
  const brought = summary.broughtForward.filter((t) => t.totalOutstanding > 0)
  if (summary.byCurrency.length === 0 && brought.length === 0) return null

  const mixed = summary.byCurrency.length > 1

  return (
    <div className="space-y-3">
      {summary.byCurrency.map((totals) => (
        <Tiles key={totals.currency} totals={totals} showCurrencyLabel={mixed} />
      ))}

      {/*
        Money owed from before this financial year.

        The lists restart on 1 April; a debt does not, so an order invoiced in
        March and unpaid in May still has to be visible somewhere. It is kept
        out of the year's own totals rather than folded in, so neither figure
        needs explaining: the tiles above are this year, this line is what came
        into it.
      */}
      {brought.length > 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Brought forward from earlier years:{' '}
          {brought.map((totals, index) => (
            <span key={totals.currency}>
              {index > 0 && ' · '}
              <strong className="tnum text-foreground">
                {formatMoney(totals.totalOutstanding, totals.currency, true)}
              </strong>{' '}
              still owed on {totals.count} order{totals.count === 1 ? '' : 's'}
            </span>
          ))}
        </p>
      )}
      {mixed && (
        <p className="text-[11px] text-muted-foreground">
          Shown per currency. These are not added together — there is no exchange rate on an order,
          only on the document that invoices it.
        </p>
      )}
    </div>
  )
}
