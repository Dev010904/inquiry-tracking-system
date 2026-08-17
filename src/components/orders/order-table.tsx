import Link from 'next/link'
import { AlertTriangle, Package } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { GST_LABEL } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { OrderStatusBadge, ProgressBar } from './order-status-badge'
import type { OrderListRow } from '@/lib/queries/orders'

function DeliveryCell({ row }: { row: OrderListRow }) {
  if (!row.deliveryDate) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap',
        row.deliveryOverdue && 'font-medium text-overdue'
      )}
    >
      {row.deliveryOverdue && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
      {formatDate(row.deliveryDate)}
    </span>
  )
}

export function OrderTable({ rows, filtered }: { rows: OrderListRow[]; filtered: boolean }) {
  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        icon={Package}
        title="No orders match those filters"
        description="Try clearing the status filter or widening the date range."
      />
    ) : (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="Orders are created by converting a quoted or negotiating inquiry, so the order always carries its history with it."
        actionLabel="Go to inquiries"
        actionHref="/inquiries"
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-right font-medium">{GST_LABEL}</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Received</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
              <th className="px-3 py-2 font-medium">Delivery</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'align-top hover:bg-accent/40',
                  // A late delivery on an open order is the one thing in this
                  // table worth interrupting someone over.
                  row.deliveryOverdue && 'bg-overdue/5'
                )}
              >
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/orders/${row.id}`} className="font-medium hover:underline">
                    {row.orderNo ?? 'Order'}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatDate(row.orderDate)}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium">{row.companyName}</p>
                  {row.inquiryNo && (
                    <p className="text-xs text-muted-foreground">{row.inquiryNo}</p>
                  )}
                </td>
                <td className="tnum px-3 py-3 text-right whitespace-nowrap">
                  {formatMoney(row.orderValue, row.currency)}
                </td>
                <td className="tnum px-3 py-3 text-right whitespace-nowrap text-muted-foreground">
                  {formatMoney(row.gstAmount, row.currency)}
                </td>
                <td className="tnum px-3 py-3 text-right font-medium whitespace-nowrap">
                  {formatMoney(row.totalWithGst, row.currency)}
                </td>
                <td className="tnum px-3 py-3 text-right whitespace-nowrap">
                  {formatMoney(row.advanceReceived, row.currency)}
                </td>
                <td
                  className={cn(
                    'tnum px-3 py-3 text-right font-semibold whitespace-nowrap',
                    row.balancePending > 0 ? 'text-overdue' : 'text-ok'
                  )}
                >
                  {formatMoney(row.balancePending, row.currency)}
                </td>
                <td className="px-3 py-3">
                  <DeliveryCell row={row} />
                </td>
                <td className="px-3 py-3">
                  <div className="space-y-1.5">
                    <OrderStatusBadge status={row.status} />
                    <ProgressBar value={row.completionPct} className="w-20" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className={cn(row.deliveryOverdue && 'bg-overdue/5')}>
            <Link href={`/orders/${row.id}`} className="block space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.orderNo ?? 'Order'} · {formatDate(row.orderDate)}
                  </p>
                </div>
                <OrderStatusBadge status={row.status} />
              </div>

              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Total</dt>
                  <dd className="tnum font-medium">{formatMoney(row.totalWithGst, row.currency)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Received</dt>
                  <dd className="tnum">{formatMoney(row.advanceReceived, row.currency)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Balance</dt>
                  <dd
                    className={cn(
                      'tnum font-semibold',
                      row.balancePending > 0 ? 'text-overdue' : 'text-ok'
                    )}
                  >
                    {formatMoney(row.balancePending, row.currency)}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between gap-2 text-xs">
                <DeliveryCell row={row} />
                <span className="text-muted-foreground">{row.completionPct}% done</span>
              </div>
              <ProgressBar value={row.completionPct} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
