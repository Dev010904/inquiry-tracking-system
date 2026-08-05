import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { INQUIRY_STATUS, type InquiryStatus } from '@/lib/constants'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary ring-1 ring-inset ring-primary/15',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        overdue: 'border-transparent bg-overdue/10 text-overdue ring-1 ring-inset ring-overdue/20',
        duesoon: 'border-transparent bg-duesoon/12 text-duesoon ring-1 ring-inset ring-duesoon/25',
        ok: 'border-transparent bg-ok/10 text-ok ring-1 ring-inset ring-ok/20',
        muted: 'border-transparent bg-muted text-muted-foreground ring-1 ring-inset ring-border',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

/** Colour mapping for inquiry statuses, kept in one place so lists agree. */
const STATUS_VARIANT: Record<InquiryStatus, BadgeProps['variant']> = {
  new: 'default',
  in_discussion: 'secondary',
  quoted: 'secondary',
  negotiation: 'duesoon',
  confirmed: 'ok',
  lost: 'overdue',
  on_hold: 'muted',
}

export function StatusBadge({ status }: { status: InquiryStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{INQUIRY_STATUS[status]}</Badge>
}

export { badgeVariants }
