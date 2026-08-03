import { AlertTriangle, ClipboardList, IndianRupee, TrendingUp, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/format'
import type { Kpis } from '@/lib/queries/dashboard'

type Tile = {
  label: string
  value: string
  hint?: string
  icon: typeof ClipboardList
  alert?: boolean
}

export function KpiCards({ kpis }: { kpis: Kpis }) {
  const tiles: Tile[] = [
    { label: 'Open inquiries', value: String(kpis.openInquiries), icon: ClipboardList },
    {
      label: 'Confirmed this month',
      value: String(kpis.confirmedThisMonth),
      hint: 'Orders booked',
      icon: TrendingUp,
    },
    {
      label: 'Order value MTD',
      value: formatINR(kpis.orderValueMtd),
      hint: 'Incl. GST @ 18%',
      icon: IndianRupee,
    },
    {
      label: 'Balance pending',
      value: formatINR(kpis.totalBalancePending),
      hint: 'Across all open orders',
      icon: Wallet,
      alert: kpis.totalBalancePending > 0,
    },
    {
      label: 'Overdue follow-ups',
      value: String(kpis.overdueFollowups),
      icon: AlertTriangle,
      alert: kpis.overdueFollowups > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map(({ label, value, hint, icon: Icon, alert }) => (
        <Card key={label} className={cn('p-4', alert && 'border-overdue/40 bg-overdue/5')}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <Icon
              className={cn('h-4 w-4 shrink-0', alert ? 'text-overdue' : 'text-muted-foreground')}
              aria-hidden
            />
          </div>
          <p className={cn('tnum mt-2 text-xl font-semibold sm:text-2xl', alert && 'text-overdue')}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </Card>
      ))}
    </div>
  )
}
