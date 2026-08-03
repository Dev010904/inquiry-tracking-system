import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RndProjectCard } from '@/lib/queries/rnd'

const DAY = 86_400_000

/**
 * Horizontal start → target view across every project with dates.
 *
 * The scale spans the earliest start to the latest target, padded so bars are
 * never flush against the edges. Today is drawn as a vertical line, which is
 * what makes slippage obvious: a bar whose right edge sits left of that line
 * is a project past its target date.
 */
export function ProjectTimeline({ projects }: { projects: RndProjectCard[] }) {
  const dated = projects.filter((p) => p.startDate && p.targetDate)

  if (dated.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarRange className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No dated projects</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Give a project a start and target date and it appears here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const starts = dated.map((p) => new Date(p.startDate!).getTime())
  const ends = dated.map((p) => new Date(p.targetDate!).getTime())
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime()

  // Include today in the range so the marker is always on-screen, even if
  // every project finished last year.
  const rawMin = Math.min(...starts, today)
  const rawMax = Math.max(...ends, today)
  const pad = Math.max((rawMax - rawMin) * 0.04, 3 * DAY)
  const min = rawMin - pad
  const max = rawMax + pad
  const span = max - min || 1

  const pct = (time: number) => ((time - min) / span) * 100
  const todayPct = pct(today)

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between space-y-0">
        <CardTitle className="text-base">Timeline</CardTitle>
        <p className="text-xs text-muted-foreground">
          {formatDate(new Date(rawMin))} – {formatDate(new Date(rawMax))}
        </p>
      </CardHeader>

      <CardContent>
        <div className="relative space-y-2 overflow-hidden">
          {/* Today marker, drawn behind the bars. */}
          <div
            className="pointer-events-none absolute inset-y-0 z-0 w-px bg-primary/40"
            style={{ left: `${todayPct}%` }}
            aria-hidden
          />

          {dated.map((project) => {
            const start = new Date(project.startDate!).getTime()
            const end = new Date(project.targetDate!).getTime()
            const left = pct(start)
            const width = Math.max(pct(end) - left, 1.5)

            return (
              <div key={project.id} className="relative z-10">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <Link
                    href={`/rnd/${project.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {project.projectCode ? `${project.projectCode} · ` : ''}
                    {project.projectName}
                  </Link>
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      project.overdue ? 'font-medium text-overdue' : 'text-muted-foreground'
                    )}
                  >
                    {formatDate(project.targetDate)}
                  </span>
                </div>

                <div className="h-6 w-full rounded bg-muted/50">
                  <div
                    className={cn(
                      'flex h-6 items-center rounded px-2',
                      project.overdue
                        ? 'bg-overdue/20 ring-1 ring-overdue/40'
                        : project.stage === 'completed'
                          ? 'bg-ok/20 ring-1 ring-ok/40'
                          : 'bg-primary/20 ring-1 ring-primary/30'
                    )}
                    style={{ marginLeft: `${left}%`, width: `${width}%` }}
                    title={`${formatDate(project.startDate)} → ${formatDate(project.targetDate)}`}
                  >
                    <span className="truncate text-[11px] font-medium text-foreground/80">
                      {project.progressPct}%
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-px bg-primary/60" aria-hidden />
          Vertical line is today. Bars ending left of it are past their target date.
        </p>
      </CardContent>
    </Card>
  )
}
