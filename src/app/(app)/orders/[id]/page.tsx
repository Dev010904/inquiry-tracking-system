import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, Mail, Phone, User } from 'lucide-react'
import { DeliveryPanel } from '@/components/orders/delivery-panel'
import { DocumentsPanel } from '@/components/orders/documents-panel'
import { MeetingsPanel } from '@/components/quality/meetings-panel'
import { QaPanel } from '@/components/quality/qa-panel'
import { QualificationTracker } from '@/components/quality/qualification-tracker'
import { FinancialSummary } from '@/components/orders/financial-summary'
import { LineItems } from '@/components/orders/line-items'
import { OrderStatusBadge, ProgressBar } from '@/components/orders/order-status-badge'
import { PaymentsLedger } from '@/components/orders/payments-ledger'
import { SpecPanel } from '@/components/orders/spec-panel'
import { WorkUpdatesFeed } from '@/components/work-updates/work-updates-feed'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { COMPANY_TYPE } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { requireProfile } from '@/lib/auth'
import { getOrderDetail } from '@/lib/queries/orders'
import { getCompanySettings, issuedTaxInvoices, listOrderDocuments } from '@/lib/queries/documents'
import {
  dispatchBlockReason,
  listMeetings,
  listQaChecks,
  listQualifications,
} from '@/lib/queries/quality'

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
  const [profile, detail, documents, parents, qaChecks, qualifications, meetings, settings] =
    await Promise.all([
      requireProfile(),
      getOrderDetail(id),
      listOrderDocuments(id),
      issuedTaxInvoices(id),
      listQaChecks(id),
      listQualifications(id),
      listMeetings({ orderId: id, limit: 5 }),
      getCompanySettings(),
    ])
  if (!detail) notFound()

  const { order, inquiry, company, contact, items, payments, workUpdates, deliveryOverdue } =
    detail

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
            <h2 className="text-xl font-semibold tracking-tight">{order.order_no ?? 'Order'}</h2>
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
          <LineItems
            orderId={order.id}
            items={items}
            currency={order.currency}
            defaultGstRate={Number(settings?.default_gst_rate ?? 18)}
            companyExemptionReason={company?.gst_exemption_reason ?? null}
          />

          <FinancialSummary order={order} />

          <SpecPanel
            orderId={order.id}
            technicalSpecification={order.technical_specification}
            addendum={order.addendum}
          />

          <DocumentsPanel
            orderId={order.id}
            documents={documents}
            parents={parents}
            gstApplicable={company?.gst_applicable ?? true}
            defaultStateCode={company?.gstin ? company.gstin.slice(0, 2) : null}
            linesMissingHsn={items.filter((item) => !item.hsn_sac).length}
          />

          <PaymentsLedger
            orderId={order.id}
            payments={payments}
            balancePending={Number(order.balance_pending ?? 0)}
            currency={order.currency}
            isAdmin={profile.role === 'admin'}
          />

          <QaPanel
            orderId={order.id}
            checks={qaChecks}
            blockReason={dispatchBlockReason(qaChecks)}
          />

          <QualificationTracker
            orderId={order.id}
            required={order.requires_qualification}
            stages={qualifications}
          />

          <MeetingsPanel
            meetings={meetings}
            newHref={`/meetings/new?order=${order.id}${
              company?.id ? `&company=${company.id}` : ''
            }`}
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
