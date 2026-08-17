import Link from 'next/link'
import { AlertTriangle, FlaskConical } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BudgetBar, StageBadge } from './stage-badge'
import { ProgressBar } from '@/components/orders/order-status-badge'
import type { RndProjectCard } from '@/lib/queries/rnd'

export function ProjectCards({
  projects,
  filtered,
}: {
  projects: RndProjectCard[]
  filtered: boolean
}) {
  if (projects.length === 0) {
    return (
      <Card>
        {filtered ? (
          <EmptyState
            icon={FlaskConical}
            title="No projects at that stage"
            description="Clear the stage filter to see everything."
          />
        ) : (
          <EmptyState
            icon={FlaskConical}
            title="No R&D projects yet"
            description="Track internal development here — budget against actual spend, stage, and dated progress notes."
            actionLabel="Start a project"
            actionHref="/rnd/new"
          />
        )}
      </Card>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <Card
          key={project.id}
          className={cn(
            'flex flex-col p-4 transition-colors hover:border-primary/40',
            project.overdue && 'border-overdue/40'
          )}
        >
          <Link href={`/rnd/${project.id}`} className="flex flex-1 flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{project.projectName}</p>
                <p className="text-xs text-muted-foreground">{project.projectCode ?? '—'}</p>
              </div>
              <StageBadge stage={project.stage} />
            </div>

            {project.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Budget used</span>
                <span
                  className={cn(
                    'tnum font-medium',
                    project.overBudget && 'text-overdue'
                  )}
                >
                  {formatMoney(project.spentToDate, project.currency)}
                  {project.approxBudget != null && (
                    <span className="font-normal text-muted-foreground">
                      {' / '}
                      {formatMoney(project.approxBudget, project.currency)}
                    </span>
                  )}
                </span>
              </div>
              <BudgetBar pct={project.budgetPct} over={project.overBudget} />
              {project.overBudget && (
                <p className="flex items-center gap-1 text-xs font-medium text-overdue">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  Over budget by{' '}
                  {formatMoney(project.spentToDate - (project.approxBudget ?? 0), project.currency)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="tnum font-medium">{project.progressPct}%</span>
              </div>
              <ProgressBar value={project.progressPct} />
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs">
              <span className="text-muted-foreground">
                {project.leadName ?? 'No lead'}
              </span>
              <span
                className={cn(
                  project.overdue ? 'font-medium text-overdue' : 'text-muted-foreground'
                )}
              >
                {project.targetDate ? `Target ${formatDate(project.targetDate)}` : 'No target date'}
              </span>
            </div>
          </Link>
        </Card>
      ))}
    </div>
  )
}
