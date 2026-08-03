import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, Mail, Phone, User } from 'lucide-react'
import { DeliveryPanel } from '@/components/orders/delivery-panel'
import { FinancialSummary } from '@/components/orders/financial-summary'
import { OrderStatusBadge, ProgressBar } from '@/components/orders/order-status-badge'
import { PaymentsLedger } from '@/components/orders/payments-ledger'
import { WorkUpdatesFeed } from '@/components/work-updates/work-updates-feed'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { COMPANY_TYPE } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { requireProfile } from '@/lib/auth'
import { getOrderDetail } from '@/lib/queries/orders'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getOrderDetail(id)
  return { title: `${detail?.order.order_no ?? 'Order'} · Inquiry Tracking System` }
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [profile, detail] = await Promise.all([requireProfile(), getOrderDetail(id)])
  if (!detail) notFound()

  const { order, inquiry, company, contact, payments, workUpdates, deliveryOverdue } = detail

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to orders
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{order.order_no ?? 'Order'}</h2>
            <OrderStatusBadge status={order.order_status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {company?.name ?? 'Unknown company'} · ordered {formatDate(order.order_date)}
            {inquiry?.inquiry_no && (
              <>
                {' · from '}
                <Link href={`/inquiries/${inquiry.id}`} className="text-primary hover:underline">
                  {inquiry.inquiry_no}
                </Link>
              </>
            )}
          </p>
        </div>

        <div className="w-full sm:w-48">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="tnum">{order.completion_pct}%</span>
          </div>
          <ProgressBar value={order.completion_pct} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <FinancialSummary order={order} />

          <PaymentsLedger
            orderId={order.id}
            payments={payments}
            balancePending={Number(order.balance_pending ?? 0)}
            isAdmin={profile.role === 'admin'}
          />

          <WorkUpdatesFeed
            parentType="order"
            parentId={order.id}
            updates={workUpdates}
            currentProgress={order.completion_pct}
          />
        </div>

        <div className="space-y-4">
          <DeliveryPanel order={order} deliveryOverdue={deliveryOverdue} />

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
                  {company?.gstin && (
                    <p className="text-xs text-muted-foreground">GSTIN: {company.gstin}</p>
                  )}
                </div>
              </div>

              {contact && (
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
