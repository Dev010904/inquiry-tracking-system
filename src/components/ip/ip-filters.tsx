'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select, optionsFrom } from '@/components/ui/select'
import { IP_STATUS, IP_TYPE } from '@/lib/constants'

export function IpFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select
        aria-label="IP type"
        className="sm:w-52"
        value={params.get('type') ?? ''}
        onChange={(e) => apply('type', e.target.value)}
      >
        <option value="">All types</option>
        {optionsFrom(IP_TYPE)}
      </Select>
      <Select
        aria-label="Status"
        className="sm:w-52"
        value={params.get('status') ?? ''}
        onChange={(e) => apply('status', e.target.value)}
      >
        <option value="">All statuses</option>
        {optionsFrom(IP_STATUS)}
      </Select>
    </div>
  )
}
