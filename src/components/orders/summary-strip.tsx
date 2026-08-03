import { Card } from '@/components/ui/card'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { OrderSummary } from '@/lib/queries/orders'

/**
 * Totals across every order matching the current filters — not just the
 * visible page. Filtering to "money outstanding" and reading this strip is
 * the fastest answer to "what are we owed".
 */
export function SummaryStrip({ summary }: { summary: OrderSummary }) {
  const tiles = [
    { label: 'Total order value', hint: 'Excl. GST', value: summary.totalOrderValue },
    { label: 'Received', hint: 'Across the payments ledger', value: summary.totalReceived },
    {
      label: 'Outstanding',
      hint: 'Incl. GST',
      value: summary.totalOutstanding,
      alert: summary.totalOutstanding > 0,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map(({ label, hint, value, alert }) => (
        <Card key={label} className={cn('p-4', alert && 'border-overdue/40 bg-overdue/5')}>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={cn('tnum mt-1 text-xl font-semibold', alert && 'text-overdue')}>
            {formatINR(value)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        </Card>
      ))}
    </div>
  )
}
