import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Pencil } from 'lucide-react'
import { StatusBadge } from '@/components/ui/badge'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContactEditor } from '@/components/companies/contact-editor'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { COMPANY_TYPE } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { currentAccess } from '@/lib/permissions'
import { getCompanyDetail } from '@/lib/queries/companies'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getCompanyDetail(id)
  return { title: `${detail?.company.name ?? 'Company'} · ANK Inquiry Tracking` }
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ features }, detail] = await Promise.all([currentAccess(), getCompanyDetail(id)])
  if (!detail) notFound()

  const { company, card, contacts, inquiries, orders } = detail
  const canEdit = features.companies.canEdit

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/companies"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to companies
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{company.name}</h2>
            <Badge variant="secondary">{COMPANY_TYPE[company.type]}</Badge>
            {!company.gst_applicable && <Badge variant="outline">No GST</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[company.city, company.state].filter(Boolean).join(', ') || 'No location recorded'}
            {company.gstin ? ` · GSTIN ${company.gstin}` : ''}
          </p>
          {company.address && (
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {company.address}
            </p>
          )}
        </div>

        {canEdit && (
          <Link
            href={`/companies/${id}/edit`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit client
          </Link>
        )}
      </div>

      {/*
        A missing buyer GSTIN is not cosmetic — a B2B tax invoice without one
        is not compliant, and the customer cannot claim credit against it. Said
        here, where someone is already looking at the client, rather than
        discovered at the moment an invoice is being raised.
      */}
      {company.gst_applicable && !company.gstin && (
        <Card className="border-duesoon/40 bg-duesoon/5 p-3">
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-duesoon" aria-hidden />
            <span>
              No GSTIN recorded. A tax invoice raised for this client will be missing the buyer
              GSTIN, and their place of supply cannot be derived.
              {canEdit && (
                <>
                  {' '}
                  <Link href={`/companies/${id}/edit`} className="font-medium underline">
                    Add it now
                  </Link>
                  .
                </>
              )}
            </span>
          </p>
        </Card>
      )}

      {!company.gst_applicable && (
        <Card className="p-3">
          <p className="text-sm">
            <span className="font-medium">GST does not apply to this client.</span> They receive a
            bill of supply, not a tax invoice.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.gst_exemption_reason || 'No exemption reason recorded.'}
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Inquiries</p>
          <p className="tnum mt-1 text-xl font-semibold">{card.inquiryCount}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{card.openInquiryCount} open</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Orders</p>
          <p className="tnum mt-1 text-xl font-semibold">{card.orderCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Total business</p>
          <p className="tnum mt-1 text-xl font-semibold">{formatMoney(card.totalBusiness, 'INR')}</p>
        </Card>
        <Card className={cn('p-4', card.balancePending > 0 && 'border-overdue/40 bg-overdue/5')}>
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p
            className={cn(
              'tnum mt-1 text-xl font-semibold',
              card.balancePending > 0 && 'text-overdue'
            )}
          >
            {formatMoney(card.balancePending, 'INR')}
          </p>
        </Card>
      </div>

      {company.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm">{company.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactEditor
              companyId={company.id}
              canEdit={canEdit}
              contacts={contacts.map((contact) => ({
                id: contact.id,
                name: contact.name,
                designation: contact.designation,
                phone: contact.phone,
                email: contact.email,
                is_primary: contact.is_primary,
              }))}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inquiries</CardTitle>
            </CardHeader>
            <CardContent>
              {inquiries.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No inquiries logged.
                </p>
              ) : (
                <ul className="divide-y">
                  {inquiries.map((inquiry) => (
                    <li key={inquiry.id}>
                      <Link
                        href={`/inquiries/${inquiry.id}`}
                        className="flex items-start justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{inquiry.inquiry_no ?? 'Draft'}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {inquiry.requirement_summary}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(inquiry.inquiry_date)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge status={inquiry.status} />
                          <span className="tnum text-xs">
                            {formatMoney(inquiry.estimated_value, inquiry.currency)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {orders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {orders.map((order) => (
                    <li key={order.id}>
                      <Link
                        href={`/orders/${order.id}`}
                        className="flex items-start justify-between gap-3 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium">{order.order_no ?? 'Order'}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(order.order_date)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <OrderStatusBadge status={order.order_status} />
                          <span className="tnum text-xs">
                            {formatMoney(order.total_with_gst, order.currency)}
                          </span>
                          {Number(order.balance_pending ?? 0) > 0 && (
                            <span className="tnum text-xs font-medium text-overdue">
                              {formatMoney(order.balance_pending, order.currency)} due
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
