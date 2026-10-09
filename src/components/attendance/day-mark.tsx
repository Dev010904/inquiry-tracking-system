import { DAY_LABEL, type DayResult } from '@/lib/attendance/compute'
import { DAY_TONE } from '@/lib/attendance/labels'
import { cn } from '@/lib/utils'

/** A day's mark as the register shows it: P, A, CL, WO… coloured by kind. */
export function DayMark({ day, className }: { day: Pick<DayResult, 'code' | 'mark' | 'label' | 'isLate' | 'overridden'>; className?: string }) {
  if (!day.code) return <span className={cn('text-muted-foreground/50', className)}>·</span>
  return (
    <span
      title={`${day.label || DAY_LABEL[day.code]}${day.isLate ? ' · late' : ''}${day.overridden ? ' · marked by an admin' : ''}`}
      className={cn(
        'relative inline-flex min-w-[2rem] items-center justify-center rounded px-1 py-0.5 text-xs font-semibold tnum',
        DAY_TONE[day.code],
        className
      )}
    >
      {day.mark}
      {day.isLate && (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-overdue" aria-hidden />
      )}
    </span>
  )
}
