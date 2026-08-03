import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, Mail, Pencil, Phone, User } from 'lucide-react'
import { AddFollowup } from '@/components/inquiries/add-followup'
import { ConvertToOrder } from '@/components/inquiries/convert-to-order'
import { FollowupItem } from '@/components/inquiries/followup-item'
import { Timeline } from '@/components/inquiries/timeline'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { COMPANY_TYPE, CONVERTIBLE_STATUSES, INQUIRY_STATUS, PRIORITY } from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/format'
import { getInquiryDetail } from '@/lib/queries/inquiries'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getInquiryDetail(id)
  return { title: `${detail?.inquiry.inquiry_no ?? 'Inquiry'} · Inquiry Tracking System` }
}

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getInquiryDetail(id)
  if (!detail) notFound()

  const { inquiry, company, contact, followups, order, ownerName, timeline } = detail
  const pending = followups.filter((f) => !f.is_done)

  // Converting is gated on both the status and the absence of an existing
  // order. The server action re-checks; this only explains why.
  const alreadyOrdered = Boolean(order)
  const convertible = CONVERTIBLE_STATUSES.includes(inquiry.status)
  const disabledReason = alreadyOrdered
    ? `Already converted to ${order?.order_no ?? 'an order'}.`
    : !convertible
      ? `Only Quoted or Negotiation inquiries can be converted. This one is ${INQUIRY_STATUS[inquiry.status]}.`
      : undefined

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/inquiries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to inquiries
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {inquiry.inquiry_no ?? 'Inquiry'}
            </h2>
            <StatusBadge status={inquiry.status} />
            <Badge variant={inquiry.priority === 'high' ? 'overdue' : 'muted'}>
              {PRIORITY[inquiry.priority]} priority
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Logged {formatDate(inquiry.inquiry_date)}
            {ownerName ? ` · owned by ${ownerName}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <Link
            href={`/inquiries/${inquiry.id}/edit`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </Link>
          <div>
            <ConvertToOrder
              inquiryId={inquiry.id}
              enabled={convertible && !alreadyOrdered}
              disabledReason={disabledReason}
              estimatedValue={inquiry.estimated_value}
            />
          </div>
        </div>
      </div>

      {order && (
        <Card className="border-ok/40 bg-ok/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">Converted to {order.order_no ?? 'an order'}</p>
              <p className="text-sm text-muted-foreground">
                {formatINR(order.total_with_gst)} incl. GST · balance{' '}
                {formatINR(order.balance_pending)}
              </p>
            </div>
            <Link href={`/orders/${order.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Open order
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requirement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm">{inquiry.requirement_summary}</p>

              <dl className="grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Estimated value</dt>
                  <dd className="tnum font-medium">{formatINR(inquiry.estimated_value)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source</dt>
                  <dd className="font-medium">{inquiry.source ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Owner</dt>
                  <dd className="font-medium">{ownerName ?? 'Unassigned'}</dd>
                </div>
              </dl>

              {inquiry.status === 'lost' && inquiry.lost_reason && (
                <div className="rounded-md border border-overdue/30 bg-overdue/5 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-overdue">
                    Lost reason
                  </p>
                  <p className="mt-1 text-sm">{inquiry.lost_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                Follow-ups
                {pending.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {pending.length} pending
                  </span>
                )}
              </CardTitle>
              <AddFollowup inquiryId={inquiry.id} />
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing scheduled. An inquiry with no follow-up is an inquiry that goes quiet.
                </p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-md border">
                  {pending.map((followup) => (
                    <FollowupItem key={followup.id} followup={followup} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="font-medium">{company?.name ?? 'Unknown company'}</p>
                  <p className="text-muted-foreground">
                    {company?.type ? COMPANY_TYPE[company.type] : '—'}
                    {company?.city ? ` · ${company.city}` : ''}
                  </p>
                </div>
              </div>

              {contact ? (
                <div className="flex items-start gap-2.5 border-t pt-3">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="space-y-1">
                    <p className="font-medium">{contact.name}</p>
                    {contact.designation && (
                      <p className="text-muted-foreground">{contact.designation}</p>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1.5 hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden />
                        {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1.5 break-all hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {contact.email}
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <p className="border-t pt-3 text-muted-foreground">No contact recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline entries={timeline} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
