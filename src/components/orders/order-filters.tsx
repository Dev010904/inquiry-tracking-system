'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { ORDER_STATUS } from '@/lib/constants'

const SORTS = {
  date_desc: 'Newest first',
  date_asc: 'Oldest first',
  balance_desc: 'Highest balance',
  delivery_asc: 'Delivery date',
}

export function OrderFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState(params.get('q') ?? '')

  useEffect(() => {
    if (search === (params.get('q') ?? '')) return
    const timer = setTimeout(() => apply({ q: search || null }), 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    next.delete('page')
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  const outstanding = params.get('outstanding') === '1'
  const hasFilters = ['q', 'status', 'outstanding', 'from', 'to'].some((k) => params.get(k))

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order no or company…"
          aria-label="Search orders"
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Select
          aria-label="Status"
          value={params.get('status') ?? ''}
          onChange={(e) => apply({ status: e.target.value || null })}
        >
          <option value="">All statuses</option>
          {optionsFrom(ORDER_STATUS)}
        </Select>

        <Input
          type="date"
          aria-label="From date"
          value={params.get('from') ?? ''}
          onChange={(e) => apply({ from: e.target.value || null })}
        />
        <Input
          type="date"
          aria-label="To date"
          value={params.get('to') ?? ''}
          onChange={(e) => apply({ to: e.target.value || null })}
        />

        <Select
          aria-label="Sort"
          value={params.get('sort') ?? 'date_desc'}
          onChange={(e) => apply({ sort: e.target.value })}
        >
          {optionsFrom(SORTS)}
        </Select>

        <Button
          variant={outstanding ? 'default' : 'outline'}
          onClick={() => apply({ outstanding: outstanding ? null : '1' })}
          aria-pressed={outstanding}
        >
          Money outstanding
        </Button>
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setSearch('')
            startTransition(() => router.replace(pathname, { scroll: false }))
          }}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear filters
        </Button>
      )}
    </div>
  )
}
