import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, ShieldCheck } from 'lucide-react'
import {
  ConfidentialityBadge,
  IpStatusBadge,
  IpTypeBadge,
  RenewalBadge,
} from '@/components/ip/ip-badges'
import { IpFilters } from '@/components/ip/ip-filters'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { IP_STATUS, IP_TYPE } from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { listIpAssets } from '@/lib/queries/ip'
import type { IpStatus, IpType } from '@/types/database'

export const metadata: Metadata = { title: 'IP Portfolio · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s || undefined
}

export default async function IpPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const typeParam = one(params.type)
  const statusParam = one(params.status)

  const type = typeParam && typeParam in IP_TYPE ? (typeParam as IpType) : undefined
  const status = statusParam && statusParam in IP_STATUS ? (statusParam as IpStatus) : undefined

  const assets = await listIpAssets({ type, status })

  const live = assets.filter((a) => !a.isDead)
  const dueSoon = live.filter((a) => a.daysToRenewal !== null && a.daysToRenewal <= 90)
  const overdue = live.filter((a) => a.renewalOverdue)
  const totalCost = assets.reduce((sum, a) => sum + a.costToDate, 0)

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">IP portfolio</h2>
          <p className="text-sm text-muted-foreground">
            Renewal deadlines also appear on the dashboard at 90, 30 and 7 days.
          </p>
        </div>
        <Link href="/ip/new" className={buttonVariants({ className: 'shrink-0' })}>
          <Plus className="h-4 w-4" aria-hidden />
          New IP asset
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Assets</p>
          <p className="tnum mt-1 text-xl font-semibold">{assets.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Granted</p>
          <p className="tnum mt-1 text-xl font-semibold">
            {assets.filter((a) => a.status === 'granted').length}
          </p>
        </Card>
        <Card className={cn('p-4', dueSoon.length > 0 && 'border-duesoon/40 bg-duesoon/5')}>
          <p className="text-xs font-medium text-muted-foreground">Renewals within 90 days</p>
          <p
            className={cn('tnum mt-1 text-xl font-semibold', dueSoon.length > 0 && 'text-duesoon')}
          >
            {dueSoon.length}
          </p>
          {overdue.length > 0 && (
            <p className="mt-0.5 text-[11px] font-medium text-overdue">
              {overdue.length} already overdue
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Spent to date</p>
          <p className="tnum mt-1 text-xl font-semibold">{formatINR(totalCost)}</p>
        </Card>
      </div>

      <IpFilters />

      {assets.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title={type || status ? 'No assets match those filters' : 'No IP assets yet'}
            description={
              type || status
                ? 'Clear the filters to see the whole portfolio.'
                : 'Record patents, designs, trademarks and know-how here. Renewal dates surface on the dashboard automatically.'
            }
            actionLabel={type || status ? undefined : 'Add the first asset'}
            actionHref={type || status ? undefined : '/ip/new'}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <Card
              key={asset.id}
              className={cn(
                'p-4 transition-colors hover:border-primary/40',
                asset.renewalOverdue && 'border-overdue/40'
              )}
            >
              <Link href={`/ip/${asset.id}`} className="flex h-full flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium leading-snug">{asset.title}</p>
                  <ConfidentialityBadge level={asset.confidentiality} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <IpTypeBadge type={asset.ipType} />
                  <IpStatusBadge status={asset.status} />
                </div>

                <dl className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <dt>Application</dt>
                    <dd className="truncate">{asset.applicationNo ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Filed</dt>
                    <dd>{formatDate(asset.filingDate)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Jurisdiction</dt>
                    <dd>{asset.jurisdiction}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
                  <span className="text-xs text-muted-foreground">
                    {asset.nextRenewalDate ? formatDate(asset.nextRenewalDate) : 'No renewal date'}
                  </span>
                  <RenewalBadge
                    days={asset.daysToRenewal}
                    overdue={asset.renewalOverdue}
                    dead={asset.isDead}
                  />
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
