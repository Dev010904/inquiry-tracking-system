import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ProjectCards } from '@/components/rnd/project-cards'
import { ProjectTimeline } from '@/components/rnd/project-timeline'
import { StageFilter } from '@/components/rnd/stage-filter'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { RND_STAGE } from '@/lib/constants'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { listRndProjects } from '@/lib/queries/rnd'
import type { RndStage } from '@/types/database'

export const metadata: Metadata = { title: 'R&D Projects · Inquiry Tracking System' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

export default async function RndPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const raw = Array.isArray(params.stage) ? params.stage[0] : params.stage
  const stage = raw && raw in RND_STAGE ? (raw as RndStage) : undefined

  const projects = await listRndProjects(stage)

  const totalBudget = projects.reduce((sum, p) => sum + (p.approxBudget ?? 0), 0)
  const totalSpent = projects.reduce((sum, p) => sum + p.spentToDate, 0)
  const overBudgetCount = projects.filter((p) => p.overBudget).length
  const overdueCount = projects.filter((p) => p.overdue).length

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">R&amp;D projects</h2>
          <p className="text-sm text-muted-foreground">
            Spend is summed from each project&apos;s expense ledger — never typed directly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StageFilter />
          <Link href="/rnd/new" className={buttonVariants({ className: 'shrink-0' })}>
            <Plus className="h-4 w-4" aria-hidden />
            New project
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Projects</p>
          <p className="tnum mt-1 text-xl font-semibold">{projects.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Total budget</p>
          <p className="tnum mt-1 text-xl font-semibold">{formatINR(totalBudget)}</p>
        </Card>
        <Card className={cn('p-4', totalSpent > totalBudget && 'border-overdue/40 bg-overdue/5')}>
          <p className="text-xs font-medium text-muted-foreground">Total spent</p>
          <p
            className={cn(
              'tnum mt-1 text-xl font-semibold',
              totalSpent > totalBudget && 'text-overdue'
            )}
          >
            {formatINR(totalSpent)}
          </p>
        </Card>
        <Card
          className={cn('p-4', (overBudgetCount > 0 || overdueCount > 0) && 'border-overdue/40 bg-overdue/5')}
        >
          <p className="text-xs font-medium text-muted-foreground">Needs attention</p>
          <p
            className={cn(
              'tnum mt-1 text-xl font-semibold',
              (overBudgetCount > 0 || overdueCount > 0) && 'text-overdue'
            )}
          >
            {overBudgetCount + overdueCount}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {overBudgetCount} over budget · {overdueCount} past target
          </p>
        </Card>
      </div>

      <ProjectTimeline projects={projects} />

      <ProjectCards projects={projects} filtered={Boolean(stage)} />
    </div>
  )
}
