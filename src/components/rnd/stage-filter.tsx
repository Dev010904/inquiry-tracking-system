'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select, optionsFrom } from '@/components/ui/select'
import { RND_STAGE } from '@/lib/constants'

export function StageFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <Select
      aria-label="Stage"
      className="w-full sm:w-48"
      value={params.get('stage') ?? ''}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString())
        if (e.target.value) next.set('stage', e.target.value)
        else next.delete('stage')
        router.replace(`${pathname}?${next.toString()}`, { scroll: false })
      }}
    >
      <option value="">All stages</option>
      {optionsFrom(RND_STAGE)}
    </Select>
  )
}
