import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/shell/back-link'
import { Building2, Mail, Pencil, Phone, User } from 'lucide-react'
import { AddFollowup } from '@/components/inquiries/add-followup'
import { ChangeStatus } from '@/components/inquiries/change-status'
import { InquiryDocuments } from '@/components/inquiries/inquiry-documents'
import { FollowupItem } from '@/components/inquiries/followup-item'
import { Timeline } from '@/components/inquiries/timeline'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { COMPANY_TYPE, PRIORITY } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { getInquiryDetail } from '@/lib/queries/inquiries'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getInquiryDetail(id)
  return { title: `${detail?.inquiry.inquiry_no ?? 'Inquiry'} · ANK Inquiry Tracking` }
}

export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getInquiryDetail(id)
  if (!detail) notFound()

  const { inquiry, company, contact, followups, order, documents, ownerName, timeline } = detail
  const pending = followups.filter((f) => !f.is_done)

  // Confirming an inquiry with no order behind it means creating one, so the
  // status control hands that case to the order form. The unique constraint on
  // orders.inquiry_id is what actually prevents a second one.
  const alreadyOrdered = Boolean(order)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <BackLink fallbackHref="/inquiries" fallbackLabel="Back to inquiries" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">
              {inquiry.inquiry_no ?? 'Inquiry'}
            </h2>
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
          {/*
            Replaces the old Convert to order button, at the owner's request.
            Status is what actually moves here, and conversion is reachable
            through Confirmed rather than sitting as a button that is disabled
            most of the time.
          */}
          <ChangeStatus
            inquiryId={inquiry.id}
            status={inquiry.status}
            lostReason={inquiry.lost_reason}
            alreadyOrdered={alreadyOrdered}
            estimatedValue={inquiry.estimated_value}
            currency={inquiry.currency}
          />
        </div>
      </div>

      {order && (
        <Card className="border-ok/40 bg-ok/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">Converted to {order.order_no ?? 'an order'}</p>
              <p className="text-sm text-muted-foreground">
                {formatMoney(order.total_with_gst, order.currency)} incl. GST · balance{' '}
                {formatMoney(order.balance_pending, order.currency)}
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
                  <dd className="tnum font-medium">{formatMoney(inquiry.estimated_value, inquiry.currency)}</dd>
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

          {/* Between Requirement and Follow-ups, at the owner's request: the
              paper that has gone out sits between what was asked for and what
              is being chased about it. The Quotation button lives here rather
              than in the page header — it used to be in both places once this
              panel existed, and one button per action is the rule. */}
          <InquiryDocuments
            inquiryId={inquiry.id}
            documents={documents}
            defaultStateCode={company?.gstin ? company.gstin.slice(0, 2) : null}
            hasOrder={alreadyOrdered}
          />

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
