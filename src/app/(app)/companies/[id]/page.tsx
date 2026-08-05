import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone, Star } from 'lucide-react'
import { StatusBadge } from '@/components/ui/badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { COMPANY_TYPE } from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
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
  const detail = await getCompanyDetail(id)
  if (!detail) notFound()

  const { company, card, contacts, inquiries, orders } = detail

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/companies"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to companies
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{company.name}</h2>
          <Badge variant="secondary">{COMPANY_TYPE[company.type]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[company.city, company.state].filter(Boolean).join(', ') || 'No location recorded'}
          {company.gstin ? ` · GSTIN ${company.gstin}` : ''}
        </p>
      </div>

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
          <p className="tnum mt-1 text-xl font-semibold">{formatINR(card.totalBusiness)}</p>
        </Card>
        <Card className={cn('p-4', card.balancePending > 0 && 'border-overdue/40 bg-overdue/5')}>
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p
            className={cn(
              'tnum mt-1 text-xl font-semibold',
              card.balancePending > 0 && 'text-overdue'
            )}
          >
            {formatINR(card.balancePending)}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No contacts recorded.
              </p>
            ) : (
              <ul className="divide-y">
                {contacts.map((contact) => (
                  <li key={contact.id} className="space-y-1 py-3 first:pt-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium">{contact.name}</p>
                      {contact.is_primary && (
                        <Star className="h-3.5 w-3.5 text-duesoon" aria-label="Primary contact" />
                      )}
                    </div>
                    {contact.designation && (
                      <p className="text-sm text-muted-foreground">{contact.designation}</p>
                    )}
                    <div className="flex flex-col gap-0.5 text-sm">
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="inline-flex items-center gap-1.5 break-all hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          {contact.email}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
                            {formatINR(inquiry.estimated_value)}
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
                            {formatINR(order.total_with_gst)}
                          </span>
                          {Number(order.balance_pending ?? 0) > 0 && (
                            <span className="tnum text-xs font-medium text-overdue">
                              {formatINR(order.balance_pending)} due
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
