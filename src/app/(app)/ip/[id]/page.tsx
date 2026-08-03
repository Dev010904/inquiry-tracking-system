import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Briefcase, Pencil, Users } from 'lucide-react'
import {
  ConfidentialityBadge,
  IpStatusBadge,
  IpTypeBadge,
  RenewalBadge,
} from '@/components/ip/ip-badges'
import { IpEvents } from '@/components/ip/ip-events'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IP_ROUTE } from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getIpAssetDetail } from '@/lib/queries/ip'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getIpAssetDetail(id)
  return { title: `${detail?.asset.title ?? 'IP asset'} · ANK Inquiry Tracking` }
}

export default async function IpAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getIpAssetDetail(id)
  // Also covers restricted assets the signed-in user is not entitled to see:
  // RLS returns no row, so this reads as "not found" rather than leaking its
  // existence.
  if (!detail) notFound()

  const { asset, card, events, projectName } = detail

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/ip"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to portfolio
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">{asset.title}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <IpTypeBadge type={asset.ip_type} />
            <IpStatusBadge status={asset.status} />
            <ConfidentialityBadge level={asset.confidentiality} />
          </div>
        </div>

        <Link href={`/ip/${asset.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </Link>
      </div>

      {card.renewalOverdue && (
        <Card className="border-overdue/40 bg-overdue/5">
          <CardContent className="flex items-start gap-2.5 p-4 text-sm text-overdue">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <strong className="font-medium">
                Renewal was due {formatDate(asset.next_renewal_date)}
              </strong>{' '}
              — {Math.abs(card.daysToRenewal ?? 0)} days ago. A missed renewal can lapse the right
              permanently.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <IpEvents assetId={asset.id} events={events} />

          {asset.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{asset.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className={cn(card.renewalOverdue && 'border-overdue/40')}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Renewal</CardTitle>
              <RenewalBadge
                days={card.daysToRenewal}
                overdue={card.renewalOverdue}
                dead={card.isDead}
              />
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Next renewal</dt>
                  <dd className={card.renewalOverdue ? 'font-medium text-overdue' : undefined}>
                    {formatDate(asset.next_renewal_date)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd>{formatDate(asset.expiry_date)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t pt-2">
                  <dt className="text-muted-foreground">Cost to date</dt>
                  <dd className="tnum font-medium">{formatINR(asset.cost_to_date)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                Cost is summed from the events below — it is not typed in.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Jurisdiction</dt>
                  <dd>{asset.jurisdiction}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Route</dt>
                  <dd>{asset.protection_route ? IP_ROUTE[asset.protection_route] : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Application no.</dt>
                  <dd className="text-right">{asset.application_no ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Registration no.</dt>
                  <dd className="text-right">{asset.registration_no ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t pt-2">
                  <dt className="text-muted-foreground">Filed</dt>
                  <dd>{formatDate(asset.filing_date)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd>{formatDate(asset.publication_date)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Granted</dt>
                  <dd>{formatDate(asset.grant_date)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ownership</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {asset.inventors.length > 0 && (
                <div className="flex items-start gap-2.5">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-xs text-muted-foreground">Inventors</p>
                    <p>{asset.inventors.join(', ')}</p>
                  </div>
                </div>
              )}

              {asset.owner_entity && (
                <div className="flex items-start gap-2.5">
                  <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-xs text-muted-foreground">Owner</p>
                    <p>{asset.owner_entity}</p>
                  </div>
                </div>
              )}

              {projectName && asset.rnd_project_id && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">From R&amp;D project</p>
                  <Link
                    href={`/rnd/${asset.rnd_project_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {projectName}
                  </Link>
                </div>
              )}

              {(asset.attorney_firm || asset.attorney_contact) && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground">Attorney</p>
                  <p>{asset.attorney_firm ?? '—'}</p>
                  {asset.attorney_contact && (
                    <p className="text-muted-foreground">{asset.attorney_contact}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
