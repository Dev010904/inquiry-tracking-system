import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { InquiryFilters } from '@/components/inquiries/inquiry-filters'
import { InquiryTable } from '@/components/inquiries/inquiry-table'
import { Pagination } from '@/components/ui/pagination'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { INQUIRY_STATUS, COMPANY_TYPE } from '@/lib/constants'
import {
  countInquiries,
  getFormOptions,
  listInquiries,
  type InquirySort,
} from '@/lib/queries/inquiries'
import { cn } from '@/lib/utils'
import type { CompanyType, InquiryStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Inquiries · Inquiry Tracking System' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return v || undefined
}

const SORTS: InquirySort[] = ['date_desc', 'date_asc', 'value_desc', 'value_asc']

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams

  // Anything unrecognised in the URL is dropped rather than passed to the
  // query — a hand-edited ?status=nonsense should not error the page.
  const statusParam = one(params.status)
  const status =
    statusParam && statusParam in INQUIRY_STATUS ? [statusParam as InquiryStatus] : undefined

  const typeParam = one(params.type)
  const companyType =
    typeParam && typeParam in COMPANY_TYPE ? (typeParam as CompanyType) : undefined

  const sortParam = one(params.sort) as InquirySort | undefined
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : 'date_desc'

  const pageParam = Number(one(params.page) ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1

  // Confirmed work is finished business, so it stays out of the list unless
  // somebody asks for it — either by picking Confirmed in the status filter or
  // by following the link at the top. An explicit status choice always wins.
  const showingConfirmed = status?.[0] === 'confirmed'
  const excludeStatus: InquiryStatus[] | undefined = status ? undefined : ['confirmed']

  const filters = {
    q: one(params.q),
    status,
    excludeStatus,
    companyType,
    ownerId: one(params.owner),
    from: one(params.from),
    to: one(params.to),
    sort,
    page,
  }

  // Both counts carry the rest of the filters, so each link says how much is
  // waiting behind it under the search and dates already set.
  const countFilters = { ...filters, page: 1 }

  const [{ staff }, result, openCount, confirmedCount] = await Promise.all([
    getFormOptions(),
    listInquiries(filters),
    countInquiries({ ...countFilters, status: undefined, excludeStatus: ['confirmed'] }),
    countInquiries({ ...countFilters, status: ['confirmed'], excludeStatus: undefined }),
  ])

  const filtered = Boolean(
    filters.q || status || companyType || filters.ownerId || filters.from || filters.to
  )

  // The two links keep every other filter, and reset the page — page 4 of one
  // list means nothing in the other.
  function tabHref(value: 'open' | 'confirmed'): string {
    const next = new URLSearchParams()
    for (const key of ['q', 'type', 'owner', 'from', 'to', 'sort'] as const) {
      const v = one(params[key])
      if (v) next.set(key, v)
    }
    if (value === 'confirmed') next.set('status', 'confirmed')
    const qs = next.toString()
    return qs ? `/inquiries?${qs}` : '/inquiries'
  }

  const heading = showingConfirmed
    ? 'Confirmed inquiries'
    : status
      ? 'All inquiries'
      : 'Inquiries to chase'

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <nav aria-label="Inquiry list" className="flex flex-wrap gap-2">
        {(
          [
            ['open', 'Still to chase', openCount],
            ['confirmed', 'Confirmed inquiries', confirmedCount],
          ] as const
        ).map(([value, label, count]) => {
          const active = value === 'confirmed' ? showingConfirmed : !showingConfirmed
          return (
            <Link
              key={value}
              href={tabHref(value)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {label} · {count}
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
          <p className="text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'record' : 'records'}
            {filtered ? ' matching your filters' : ''}
          </p>
        </div>
        <Link href="/inquiries/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" aria-hidden />
          New inquiry
        </Link>
      </div>

      <InquiryFilters staff={staff} />

      <Card className="overflow-hidden">
        <InquiryTable rows={result.rows} filtered={filtered} />
      </Card>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        noun="inquiry"
        nounPlural="inquiries"
      />
    </div>
  )
}
