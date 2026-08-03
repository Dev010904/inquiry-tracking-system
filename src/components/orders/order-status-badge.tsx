import { Badge, type BadgeProps } from '@/components/ui/badge'
import { ORDER_STATUS } from '@/lib/constants'
import type { OrderStatus } from '@/types/database'

const VARIANT: Record<OrderStatus, BadgeProps['variant']> = {
  pending: 'muted',
  in_production: 'default',
  dispatched: 'duesoon',
  delivered: 'ok',
  closed: 'secondary',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANT[status]}>{ORDER_STATUS[status]}</Badge>
}

/** Thin progress bar used in both the list and the detail header. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Completion"
    >
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}
