import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { InquiryFilters } from '@/components/inquiries/inquiry-filters'
import { InquiryTable } from '@/components/inquiries/inquiry-table'
import { Pagination } from '@/components/ui/pagination'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { INQUIRY_STATUS, COMPANY_TYPE } from '@/lib/constants'
import { getFormOptions, listInquiries, type InquirySort } from '@/lib/queries/inquiries'
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

  const filters = {
    q: one(params.q),
    status,
    companyType,
    ownerId: one(params.owner),
    from: one(params.from),
    to: one(params.to),
    sort,
    page,
  }

  const [{ staff }, result] = await Promise.all([getFormOptions(), listInquiries(filters)])

  const filtered = Boolean(
    filters.q || status || companyType || filters.ownerId || filters.from || filters.to
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">All inquiries</h2>
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
