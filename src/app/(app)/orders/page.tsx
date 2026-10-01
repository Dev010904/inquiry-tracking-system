import type { Metadata } from 'next'
import { OrderFilters } from '@/components/orders/order-filters'
import { OrderTable } from '@/components/orders/order-table'
import { SummaryStrip } from '@/components/orders/summary-strip'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { ORDER_STATUS } from '@/lib/constants'
import { listOrders, type OrderSort } from '@/lib/queries/orders'
import type { OrderStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Orders · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

type Search = Record<string, string | string[] | undefined>

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return v || undefined
}

const SORTS: OrderSort[] = ['date_desc', 'date_asc', 'balance_desc', 'delivery_asc']

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams

  const statusParam = one(params.status)
  const status = statusParam && statusParam in ORDER_STATUS ? (statusParam as OrderStatus) : undefined

  const sortParam = one(params.sort) as OrderSort | undefined
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : 'date_desc'

  const pageParam = Number(one(params.page) ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1

  const filters = {
    q: one(params.q),
    status,
    outstanding: one(params.outstanding) === '1',
    from: one(params.from),
    to: one(params.to),
    sort,
    page,
  }

  const result = await listOrders(filters)
  const filtered = Boolean(
    filters.q || status || filters.outstanding || filters.from || filters.to
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Orders</h2>
        <p className="text-sm text-muted-foreground">
          Orders are created by converting an inquiry. GST, totals and balances are calculated by
          the database — nobody types them.
        </p>
      </div>

      <SummaryStrip summary={result.summary} />

      <OrderFilters />

      <Card className="overflow-hidden">
        <OrderTable rows={result.rows} filtered={filtered} />
      </Card>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        noun="order"
        nounPlural="orders"
      />
    </div>
  )
}
