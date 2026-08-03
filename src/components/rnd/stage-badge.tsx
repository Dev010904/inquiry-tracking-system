import { Badge, type BadgeProps } from '@/components/ui/badge'
import { RND_STAGE } from '@/lib/constants'
import type { RndStage } from '@/types/database'

const VARIANT: Record<RndStage, BadgeProps['variant']> = {
  concept: 'muted',
  design: 'secondary',
  prototype: 'default',
  testing: 'duesoon',
  completed: 'ok',
  shelved: 'muted',
}

export function StageBadge({ stage }: { stage: RndStage }) {
  return <Badge variant={VARIANT[stage]}>{RND_STAGE[stage]}</Badge>
}

/**
 * Budget consumption bar. Turns amber past 80% and red past 100% — the point
 * is to notice the overrun before the project is finished, not after.
 */
export function BudgetBar({ pct, over }: { pct: number | null; over: boolean }) {
  if (pct === null) {
    return <p className="text-xs text-muted-foreground">No budget set</p>
  }

  const width = Math.min(100, Math.max(0, pct))
  const tone = over ? 'bg-overdue' : pct >= 80 ? 'bg-duesoon' : 'bg-ok'

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Budget used"
    >
      <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${width}%` }} />
    </div>
  )
}
