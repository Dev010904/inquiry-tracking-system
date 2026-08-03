import type { Metadata } from 'next'
import { AgingChart, MonthlyChart, OrderValueChart } from '@/components/reports/report-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IP_STATUS, IP_TYPE } from '@/lib/constants'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getReportData } from '@/lib/queries/reports'

export const metadata: Metadata = { title: 'Reports · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const data = await getReportData()
  const { totals, monthly, aging, lossReasons, ipByType, ipByStatus, ipCost } = data

  const agingTotal = aging.reduce((sum, b) => sum + b.amount, 0)
  const over90 = aging[3]?.amount ?? 0

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Last 6 months. Conversion counts an order in the month its inquiry was logged, not the
          month it closed.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Conversion rate</p>
          <p className="tnum mt-1 text-xl font-semibold">
            {totals.conversionPct === null ? '—' : `${totals.conversionPct}%`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {totals.won} won · {totals.lost} lost · {totals.open} open
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Total inquiries</p>
          <p className="tnum mt-1 text-xl font-semibold">{totals.inquiries}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Order value</p>
          <p className="tnum mt-1 text-xl font-semibold">{formatINR(totals.orderValue)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Incl. GST, all time</p>
        </Card>
        <Card className={cn('p-4', totals.outstanding > 0 && 'border-overdue/40 bg-overdue/5')}>
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p
            className={cn(
              'tnum mt-1 text-xl font-semibold',
              totals.outstanding > 0 && 'text-overdue'
            )}
          >
            {formatINR(totals.outstanding)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inquiries, orders and conversion</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bars are counts on the left axis; the line is conversion percentage on the right.
          </p>
        </CardHeader>
        <CardContent>
          <MonthlyChart data={monthly} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order value by month</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderValueChart data={monthly} />
          </CardContent>
        </Card>

        <Card className={cn(over90 > 0 && 'border-overdue/40')}>
          <CardHeader>
            <CardTitle className="text-base">Payment aging</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatINR(agingTotal)} outstanding, aged from the order date.
            </p>
          </CardHeader>
          <CardContent>
            <AgingChart data={aging} />
            {over90 > 0 && (
              <p className="mt-3 rounded-md border border-overdue/30 bg-overdue/5 p-3 text-sm text-overdue">
                {formatINR(over90)} has been outstanding for more than 90 days.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Why inquiries were lost</CardTitle>
          </CardHeader>
          <CardContent>
            {lossReasons.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing marked lost yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {lossReasons.map((reason) => {
                  const pct = totals.lost > 0 ? (reason.count / totals.lost) * 100 : 0
                  return (
                    <li key={reason.reason} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span
                          className={cn(
                            'min-w-0 truncate',
                            reason.reason === 'Not recorded' && 'text-muted-foreground italic'
                          )}
                        >
                          {reason.reason}
                        </span>
                        <span className="tnum shrink-0 text-muted-foreground">
                          {reason.count}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-overdue"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">IP portfolio</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatINR(ipCost)} spent on protection to date.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                By type
              </p>
              {ipByType.length === 0 ? (
                <p className="text-sm text-muted-foreground">No IP assets recorded.</p>
              ) : (
                <ul className="space-y-1.5">
                  {ipByType.map((row) => (
                    <li key={row.type} className="flex justify-between gap-3 text-sm">
                      <span>{IP_TYPE[row.type]}</span>
                      <span className="tnum text-muted-foreground">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {ipByStatus.length > 0 && (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  By status
                </p>
                <ul className="space-y-1.5">
                  {ipByStatus.map((row) => (
                    <li key={row.status} className="flex justify-between gap-3 text-sm">
                      <span>{IP_STATUS[row.status]}</span>
                      <span className="tnum text-muted-foreground">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
