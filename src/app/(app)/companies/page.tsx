import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Building2, Mail, Pencil, Phone } from 'lucide-react'
import { CompanySearch } from '@/components/companies/company-search'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { COMPANY_TYPE } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { currentAccess } from '@/lib/permissions'
import { listCompanies } from '@/lib/queries/companies'

export const metadata: Metadata = { title: 'Companies · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams
  const q = (Array.isArray(params.q) ? params.q[0] : params.q) || undefined

  const [{ features }, companies] = await Promise.all([currentAccess(), listCompanies(q)])
  const canEdit = features.companies.canEdit

  const totalBusiness = companies.reduce((sum, c) => sum + c.totalBusiness, 0)
  const totalOutstanding = companies.reduce((sum, c) => sum + c.balancePending, 0)
  // Only a GST-applicable client needs one. A client marked exempt is
  // complete without a GSTIN and must not be counted as unfinished work.
  const missingGstin = companies.filter((c) => c.gstApplicable && !c.gstin).length

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Companies &amp; schools</h2>
        <p className="text-sm text-muted-foreground">
          Every client, their contacts, and what they are worth.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Clients</p>
          <p className="tnum mt-1 text-xl font-semibold">{companies.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Total business</p>
          <p className="tnum mt-1 text-xl font-semibold">{formatMoney(totalBusiness, 'INR')}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Incl. GST, all orders</p>
        </Card>
        <Card className={cn('p-4', totalOutstanding > 0 && 'border-overdue/40 bg-overdue/5')}>
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p
            className={cn(
              'tnum mt-1 text-xl font-semibold',
              totalOutstanding > 0 && 'text-overdue'
            )}
          >
            {formatMoney(totalOutstanding, 'INR')}
          </p>
        </Card>
      </div>

      <CompanySearch />

      {/*
        Said on the list because it is a list-shaped problem: an invoice cannot
        be raised compliantly for any of these, and the owner needs to know how
        many there are, not to find out one at a time.
      */}
      {missingGstin > 0 && !q && (
        <Card className="border-duesoon/40 bg-duesoon/5 p-3">
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-duesoon" aria-hidden />
            <span>
              {missingGstin} of {companies.length} client{companies.length === 1 ? '' : 's'} have no
              GSTIN recorded. A B2B tax invoice raised for them would not be compliant.
            </span>
          </p>
        </Card>
      )}

      {companies.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={q ? 'No client matches that search' : 'No clients yet'}
            description={
              q
                ? 'Try a shorter search term.'
                : 'Companies are created as you log inquiries — there is no separate step.'
            }
            actionLabel={q ? undefined : 'Log an inquiry'}
            actionHref={q ? undefined : '/inquiries/new'}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => (
            <Card key={company.id} className="p-4 transition-colors hover:border-primary/40">
              <Link href={`/companies/${company.id}`} className="flex h-full flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{company.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {COMPANY_TYPE[company.type]}
                      {company.city ? ` · ${company.city}` : ''}
                    </p>
                  </div>
                  {company.openInquiryCount > 0 && (
                    <Badge variant="default">{company.openInquiryCount} open</Badge>
                  )}
                </div>

                {company.primaryContact ? (
                  <div className="space-y-0.5 text-sm">
                    <p>
                      {company.primaryContact.name}
                      {company.primaryContact.designation && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {company.primaryContact.designation}
                        </span>
                      )}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {company.primaryContact.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" aria-hidden />
                          {company.primaryContact.phone}
                        </span>
                      )}
                      {company.primaryContact.email && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{company.primaryContact.email}</span>
                        </span>
                      )}
                    </p>
                    {company.contactCount > 1 && (
                      <p className="text-xs text-muted-foreground">
                        +{company.contactCount - 1} more contact
                        {company.contactCount > 2 ? 's' : ''}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No contact recorded</p>
                )}

                <dl className="mt-auto grid grid-cols-3 gap-2 border-t pt-2.5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Inquiries</dt>
                    <dd className="tnum font-medium">{company.inquiryCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Orders</dt>
                    <dd className="tnum font-medium">{company.orderCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Business</dt>
                    <dd className="tnum font-medium">{formatMoney(company.totalBusiness, 'INR')}</dd>
                  </div>
                </dl>

                {company.balancePending > 0 && (
                  <p className="text-xs font-medium text-overdue">
                    {formatMoney(company.balancePending, 'INR')} outstanding
                  </p>
                )}
                {company.lastInquiryDate && (
                  <p className="text-[11px] text-muted-foreground">
                    Last inquiry {formatDate(company.lastInquiryDate)}
                  </p>
                )}
              </Link>

              {/*
                Outside the Link above, not inside it — a link nested in a link
                is invalid and the browser resolves it however it likes.
              */}
              {(canEdit || (company.gstApplicable && !company.gstin)) && (
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
                  {company.gstApplicable && !company.gstin ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-duesoon">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      No GSTIN
                    </span>
                  ) : (
                    <span />
                  )}
                  {canEdit && (
                    <Link
                      href={`/companies/${company.id}/edit`}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Link>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
