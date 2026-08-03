'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function CompanySearch() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [value, setValue] = useState(params.get('q') ?? '')

  useEffect(() => {
    if (value === (params.get('q') ?? '')) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set('q', value)
      else next.delete('q')
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search company or school name…"
        aria-label="Search companies"
        className="pl-9"
      />
    </div>
  )
}
