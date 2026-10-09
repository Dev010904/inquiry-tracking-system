import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { formatMonth, shiftMonth, type IsoMonth } from '@/lib/attendance/time'

/** Previous / next month, keeping the rest of the address. */
export function MonthNav({ month, basePath, current }: { month: IsoMonth; basePath: string; current: IsoMonth }) {
  const href = (m: IsoMonth) => `${basePath}?month=${m}`
  const next = shiftMonth(month, 1)
  return (
    <div className="flex items-center gap-2">
      <Link href={href(shiftMonth(month, -1))} className={buttonVariants({ variant: 'outline', size: 'icon' })} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
      <span className="min-w-[9rem] text-center font-semibold">{formatMonth(month)}</span>
      {next <= current ? (
        <Link href={href(next)} className={buttonVariants({ variant: 'outline', size: 'icon' })} aria-label="Next month">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <span className={buttonVariants({ variant: 'outline', size: 'icon', className: 'pointer-events-none opacity-40' })} aria-hidden>
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
      {month !== current && (
        <Link href={href(current)} className="text-sm text-primary hover:underline">
          This month
        </Link>
      )}
    </div>
  )
}
