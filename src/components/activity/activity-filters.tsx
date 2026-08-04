'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, optionsFrom } from '@/components/ui/select'
import { ACTIVITY_SECTIONS } from '@/lib/queries/activity'

const PERIODS = {
  '1': 'Last 24 hours',
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '0': 'Everything',
}

export function ActivityFilters({ actors }: { actors: { id: string; full_name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const hasFilters = ['who', 'section'].some((k) => params.get(k)) || params.get('days') === '0'

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:p-4">
      <Select
        aria-label="Period"
        className="sm:w-44"
        value={params.get('days') ?? '1'}
        onChange={(e) => apply('days', e.target.value)}
      >
        {optionsFrom(PERIODS)}
      </Select>

      <Select
        aria-label="Person"
        className="sm:w-52"
        value={params.get('who') ?? ''}
        onChange={(e) => apply('who', e.target.value)}
      >
        <option value="">Everyone</option>
        {actors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.full_name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Section"
        className="sm:w-52"
        value={params.get('section') ?? ''}
        onChange={(e) => apply('section', e.target.value)}
      >
        <option value="">All sections</option>
        {optionsFrom(ACTIVITY_SECTIONS)}
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      )}
    </div>
  )
}
