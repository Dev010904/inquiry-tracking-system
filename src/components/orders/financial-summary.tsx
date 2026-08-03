import { Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GST_LABEL } from '@/lib/constants'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { OrderRow } from '@/types/database'

/**
 * Invoice-style breakdown. Every line except the order value is computed by
 * Postgres — `gst_amount`, `total_with_gst` and `balance_pending` are
 * generated columns, and `advance_received` is trigger-maintained from the
 * payments ledger. The padlock note tells staff why none of it is editable.
 */
export function FinancialSummary({ order }: { order: OrderRow }) {
  const balance = Number(order.balance_pending ?? 0)
  const settled = balance <= 0

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Financials</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Auto-calculated
        </span>
      </CardHeader>

      <CardContent>
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Order value (excl. GST)</dt>
            <dd className="tnum">{formatINR(order.order_value, true)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{GST_LABEL}</dt>
            <dd className="tnum">{formatINR(order.gst_amount, true)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-t pt-2 text-base font-semibold">
            <dt>Total with GST</dt>
            <dd className="tnum">{formatINR(order.total_with_gst, true)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="text-muted-foreground">Advance received</dt>
            <dd className="tnum">{formatINR(order.advance_received, true)}</dd>
          </div>

          <div
            className={cn(
              'flex items-baseline justify-between gap-4 border-t pt-2 text-base font-semibold',
              settled ? 'text-ok' : 'text-overdue'
            )}
          >
            <dt>Balance pending</dt>
            <dd className="tnum">{formatINR(balance, true)}</dd>
          </div>
        </dl>

        {settled && (
          <p className="mt-3 rounded-md bg-ok/10 px-3 py-2 text-sm text-ok">
            Fully paid.
            {balance < 0 && ` Received ${formatINR(Math.abs(balance), true)} more than invoiced.`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
