'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'

type Props = {
  page: number
  pageCount: number
  total: number
  /** Singular noun for the count line, e.g. "inquiry" / "order". */
  noun: string
  nounPlural: string
}

/** Page state lives in the URL alongside the filters, so links stay shareable. */
export function Pagination({ page, pageCount, total, noun, nounPlural }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  if (pageCount <= 1) {
    return (
      <p className="px-1 py-2 text-sm text-muted-foreground">
        {total} {total === 1 ? noun : nounPlural}
      </p>
    )
  }

  function goTo(next: number) {
    const search = new URLSearchParams(params.toString())
    search.set('page', String(next))
    router.push(`${pathname}?${search.toString()}`, { scroll: true })
  }

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount} · {total} total
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goTo(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
