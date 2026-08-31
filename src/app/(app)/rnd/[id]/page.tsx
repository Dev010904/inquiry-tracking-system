import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/shell/back-link'
import { AlertTriangle, Pencil, ShieldCheck } from 'lucide-react'
import { ExpenseLedger } from '@/components/rnd/expense-ledger'
import { BudgetBar, StageBadge } from '@/components/rnd/stage-badge'
import { ProgressBar } from '@/components/orders/order-status-badge'
import { PendingWorkCard } from '@/components/tasks/pending-work-card'
import { WorkUpdatesFeed } from '@/components/work-updates/work-updates-feed'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IP_STATUS, IP_TYPE } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { requireProfile } from '@/lib/auth'
import { getAssignableStaff, getPendingTasks } from '@/lib/queries/tasks'
import { getRndProjectDetail } from '@/lib/queries/rnd'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getRndProjectDetail(id)
  return { title: `${detail?.project.project_name ?? 'Project'} · Inquiry Tracking System` }
}

export default async function RndProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [profile, detail, tasks, staff] = await Promise.all([
    requireProfile(),
    getRndProjectDetail(id),
    getPendingTasks('rnd', id),
    getAssignableStaff(),
  ])
  if (!detail) notFound()

  const { project, card, expenses, workUpdates, ipAssets } = detail

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <BackLink fallbackHref="/rnd" fallbackLabel="Back to projects" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{project.project_name}</h2>
            <StageBadge stage={project.stage} />
            {card.overdue && <Badge variant="overdue">Past target</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {project.project_code ?? 'No code'}
            {card.leadName ? ` · led by ${card.leadName}` : ''}
          </p>
        </div>

        <Link href={`/rnd/${project.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {project.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{project.description}</p>
                {project.notes && (
                  <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm text-muted-foreground">
                    {project.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <ExpenseLedger
            projectId={project.id}
            expenses={expenses}
            budget={card.approxBudget}
            spent={card.spentToDate}
            currency={project.currency}
            isAdmin={profile.role === 'admin'}
          />

          <WorkUpdatesFeed
            parentType="rnd"
            parentId={project.id}
            updates={workUpdates}
            currentProgress={project.progress_pct}
          />

          {/* Directly after the work updates, per the owner: that feed says
              what was done, this card says what is left. */}
          <PendingWorkCard
            parentType="rnd"
            parentId={project.id}
            tasks={tasks}
            staff={staff}
            currentUserId={profile.id}
            isAdmin={profile.role === 'admin'}
          />
        </div>

        <div className="space-y-4">
          <Card className={cn(card.overBudget && 'border-overdue/40')}>
            <CardHeader>
              <CardTitle className="text-base">Budget</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Approx. budget</dt>
                  <dd className="tnum">{formatMoney(card.approxBudget, project.currency)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Spent to date</dt>
                  <dd className={cn('tnum font-medium', card.overBudget && 'text-overdue')}>
                    {formatMoney(card.spentToDate, project.currency)}
                  </dd>
                </div>
                {card.approxBudget != null && (
                  <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
                    <dt>{card.overBudget ? 'Over by' : 'Remaining'}</dt>
                    <dd className={cn('tnum', card.overBudget ? 'text-overdue' : 'text-ok')}>
                      {formatMoney(Math.abs(card.approxBudget - card.spentToDate), project.currency)}
                    </dd>
                  </div>
                )}
              </dl>

              <BudgetBar pct={card.budgetPct} over={card.overBudget} />

              {card.overBudget && (
                <p className="flex items-start gap-2 rounded-md border border-overdue/30 bg-overdue/5 p-3 text-sm text-overdue">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Spend has passed the approximate budget.
                </p>
              )}

              <div className="border-t pt-3">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="tnum font-medium">{project.progress_pct}%</span>
                </div>
                <ProgressBar value={project.progress_pct} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Start</dt>
                  <dd>{formatDate(project.start_date)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Target</dt>
                  <dd className={card.overdue ? 'font-medium text-overdue' : undefined}>
                    {formatDate(project.target_date)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Actual end</dt>
                  <dd>{formatDate(project.actual_end_date)}</dd>
                </div>
                {card.daysToTarget !== null && !project.actual_end_date && (
                  <div className="flex justify-between gap-3 border-t pt-2">
                    <dt className="text-muted-foreground">
                      {card.daysToTarget < 0 ? 'Overdue by' : 'Time left'}
                    </dt>
                    <dd className={card.overdue ? 'font-medium text-overdue' : undefined}>
                      {Math.abs(card.daysToTarget)} days
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
                IP from this project
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ipAssets.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No IP assets linked yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {ipAssets.map((asset) => (
                    <li key={asset.id} className="py-2.5">
                      <Link href={`/ip/${asset.id}`} className="block hover:underline">
                        <p className="text-sm font-medium">{asset.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {IP_TYPE[asset.ip_type]} · {IP_STATUS[asset.status]}
                          {asset.next_renewal_date
                            ? ` · renews ${formatDate(asset.next_renewal_date)}`
                            : ''}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
