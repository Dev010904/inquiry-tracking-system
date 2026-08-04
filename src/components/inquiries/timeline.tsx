import {
  CalendarPlus,
  CheckCircle2,
  FileText,
  Package,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { formatDateTimeIST } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TimelineEntry } from '@/lib/queries/inquiries'

const ICONS: Record<TimelineEntry['kind'], LucideIcon> = {
  created: FileText,
  status: RefreshCw,
  followup_due: CalendarPlus,
  followup_done: CheckCircle2,
  note: FileText,
  order: Package,
}

const TONES: Record<TimelineEntry['kind'], string> = {
  created: 'bg-muted text-muted-foreground',
  status: 'bg-primary/10 text-primary',
  followup_due: 'bg-muted text-muted-foreground',
  followup_done: 'bg-ok/12 text-ok',
  note: 'bg-muted text-muted-foreground',
  order: 'bg-ok/12 text-ok',
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
  }

  return (
    <ol className="relative space-y-4 border-l pl-6">
      {entries.map((entry) => {
        const Icon = ICONS[entry.kind]
        return (
          <li key={entry.id} className="relative">
            <span
              className={cn(
                'absolute -left-[2.1rem] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card',
                TONES[entry.kind]
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <p className="text-sm font-medium capitalize">{entry.title}</p>
            {entry.detail && (
              <p className="text-sm text-muted-foreground">{entry.detail}</p>
            )}
            <p className="text-xs text-muted-foreground">{formatDateTimeIST(entry.at)}</p>
          </li>
        )
      })}
    </ol>
  )
}
