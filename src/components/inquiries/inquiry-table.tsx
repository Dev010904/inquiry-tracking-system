import Link from 'next/link'
import { ClipboardList, Package } from 'lucide-react'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { COMPANY_TYPE, PRIORITY } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { InquiryListRow } from '@/lib/queries/inquiries'
import type { PriorityLevel } from '@/types/database'

const PRIORITY_VARIANT: Record<PriorityLevel, 'overdue' | 'duesoon' | 'muted'> = {
  high: 'overdue',
  medium: 'duesoon',
  low: 'muted',
}

function isOverdue(iso: string | null): boolean {
  return Boolean(iso) && new Date(iso!) < new Date()
}

function FollowupCell({ at }: { at: string | null }) {
  if (!at) return <Badge variant="muted">None set</Badge>
  return (
    <span className={cn('whitespace-nowrap', isOverdue(at) && 'font-medium text-overdue')}>
      {formatDate(at)}
    </span>
  )
}

export function InquiryTable({
  rows,
  filtered,
}: {
  rows: InquiryListRow[]
  filtered: boolean
}) {
  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        icon={ClipboardList}
        title="No inquiries match those filters"
        description="Try widening the date range or clearing the status filter."
      />
    ) : (
      <EmptyState
        icon={ClipboardList}
        title="No inquiries yet"
        description="Every inquiry logged here gets a follow-up deadline, so nothing goes quiet without someone noticing."
        actionLabel="Log the first inquiry"
        actionHref="/inquiries/new"
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Inquiry</th>
              <th className="px-3 py-2 font-medium">Company / school</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Est. value</th>
              <th className="px-3 py-2 font-medium">Next follow-up</th>
              <th className="px-3 py-2 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-accent/40">
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/inquiries/${row.id}`} className="font-medium hover:underline">
                    {row.inquiryNo ?? 'Draft'}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatDate(row.inquiryDate)}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium">{row.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.companyType ? COMPANY_TYPE[row.companyType] : '—'}
                  </p>
                </td>
                <td className="px-3 py-3">
                  {row.contactName ? (
                    <>
                      <p>{row.contactName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.contactDesignation ?? ''}
                        {row.contactDesignation && row.contactPhone ? ' · ' : ''}
                        {row.contactPhone && (
                          <a href={`tel:${row.contactPhone}`} className="hover:underline">
                            {row.contactPhone}
                          </a>
                        )}
                      </p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={row.status} />
                    {row.priority !== 'low' && (
                      <Badge variant={PRIORITY_VARIANT[row.priority]}>
                        {PRIORITY[row.priority]}
                      </Badge>
                    )}
                    {row.hasOrder && (
                      <Badge variant="ok">
                        <Package className="mr-1 h-3 w-3" aria-hidden />
                        Order
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="tnum px-3 py-3 text-right whitespace-nowrap">
                  {formatMoney(row.estimatedValue, row.currency)}
                </td>
                <td className="px-3 py-3">
                  <FollowupCell at={row.nextFollowupAt} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                  {row.ownerName ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={`/inquiries/${row.id}`} className="block space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.inquiryNo ? `${row.inquiryNo} · ` : ''}
                    {formatDate(row.inquiryDate)}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>

              <p className="line-clamp-2 text-sm text-muted-foreground">
                {row.requirementSummary}
              </p>

              {row.contactName && (
                <p className="text-sm">
                  {row.contactName}
                  {row.contactPhone && (
                    <span className="text-muted-foreground"> · {row.contactPhone}</span>
                  )}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="tnum text-sm font-medium">{formatMoney(row.estimatedValue, row.currency)}</span>
                <span className="text-xs">
                  <FollowupCell at={row.nextFollowupAt} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
