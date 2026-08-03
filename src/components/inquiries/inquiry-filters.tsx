'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { COMPANY_TYPE, INQUIRY_STATUS } from '@/lib/constants'

type Props = {
  staff: { id: string; full_name: string }[]
}

const SORTS = {
  date_desc: 'Newest first',
  date_asc: 'Oldest first',
  value_desc: 'Highest value',
  value_asc: 'Lowest value',
}

/**
 * Filters live in the URL, so a filtered list is shareable, survives a
 * refresh, and the back button behaves the way people expect.
 */
export function InquiryFilters({ staff }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState(params.get('q') ?? '')

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    const current = params.get('q') ?? ''
    if (search === current) return
    const timer = setTimeout(() => apply({ q: search || null, page: null }), 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    // Any filter change resets to page 1 — page 4 of the old result set is
    // meaningless against the new one.
    if (!('page' in changes)) next.delete('page')
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  const hasFilters = ['q', 'status', 'type', 'owner', 'from', 'to'].some((key) => params.get(key))

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
          placeholder="Search inquiry no, requirement or company…"
          aria-label="Search inquiries"
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Select
          aria-label="Status"
          value={params.get('status') ?? ''}
          onChange={(e) => apply({ status: e.target.value || null })}
        >
          <option value="">All statuses</option>
          {optionsFrom(INQUIRY_STATUS)}
        </Select>

        <Select
          aria-label="Company type"
          value={params.get('type') ?? ''}
          onChange={(e) => apply({ type: e.target.value || null })}
        >
          <option value="">All client types</option>
          {optionsFrom(COMPANY_TYPE)}
        </Select>

        <Select
          aria-label="Owner"
          value={params.get('owner') ?? ''}
          onChange={(e) => apply({ owner: e.target.value || null })}
        >
          <option value="">All owners</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
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
