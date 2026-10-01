'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { NAV_CURRENT_KEY, NAV_PREV_KEY, isFormPage } from '@/components/shell/nav-history'

type Props = {
  /** Where to go when there is nothing recorded — a fresh tab, or a pasted link. */
  fallbackHref: string
  /** What to call that destination. */
  fallbackLabel: string
}

/**
 * What each section is called when you are going back to it.
 *
 * A detail route gets the singular ("the order"), a list route the plural
 * ("orders"), because "Back to orders" landing on one specific order reads as
 * a bug even when it is what you asked for.
 */
const SECTIONS: { match: RegExp; detail: string; list: string }[] = [
  { match: /^\/orders/, detail: 'the order', list: 'orders' },
  { match: /^\/inquiries/, detail: 'the inquiry', list: 'inquiries' },
  { match: /^\/documents/, detail: 'the document', list: 'documents' },
  { match: /^\/companies/, detail: 'the client', list: 'companies' },
  { match: /^\/rnd/, detail: 'the project', list: 'R&D projects' },
  { match: /^\/ip/, detail: 'the IP record', list: 'IP portfolio' },
  { match: /^\/meetings/, detail: 'the meeting', list: 'meetings' },
  { match: /^\/payments/, detail: 'the ledger', list: 'the ledger' },
  { match: /^\/reports/, detail: 'reports', list: 'reports' },
  { match: /^\/activity/, detail: 'recent changes', list: 'recent changes' },
  { match: /^\/dashboard/, detail: 'the dashboard', list: 'the dashboard' },
]

function labelFor(url: string): string | null {
  const path = url.split('?')[0] ?? url
  const section = SECTIONS.find((s) => s.match.test(path))
  if (!section) return null
  // Three segments means /section/<id> — a specific record rather than a list.
  const isDetail = path.split('/').filter(Boolean).length > 1
  return `Back to ${isDetail ? section.detail : section.list}`
}

/**
 * Back to wherever you actually came from.
 *
 * The link used to be hardcoded per screen, so opening an order, then a
 * document raised against it, then Back, dropped you in the Documents list —
 * a place you had not been, two steps away from the order you were reading.
 * Every detail screen had the same flaw; it was only obvious on documents
 * because that is the one reached from three different directions.
 *
 * Renders as a button rather than an anchor because the destination is only
 * known in the browser. The fallback still points somewhere sensible, so a
 * pasted link or a fresh tab behaves exactly as it did before.
 */
export function BackLink({ fallbackHref, fallbackLabel }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [previous, setPrevious] = useState<{ href: string; label: string } | null>(null)

  useEffect(() => {
    try {
      const recordedCurrent = sessionStorage.getItem(NAV_CURRENT_KEY)
      const recordedPrevious = sessionStorage.getItem(NAV_PREV_KEY)

      /*
       * Which of the two is "where I came from" depends on whether NavHistory
       * has run yet, and the order of two effects on the same render is not
       * something to rely on. It was relied on, and it was wrong: this link
       * read `prev` before NavHistory had moved it along, so arriving at a
       * document from an order offered "Back to orders" — the list — while the
       * store already held the order itself.
       *
       * Deciding by content rather than by timing removes the race. If the
       * recorded current page is not the page being rendered, NavHistory has
       * not caught up and that recorded value IS the previous page. If it does
       * match, NavHistory has caught up and `prev` is the one.
       */
      const candidates = [
        recordedCurrent && recordedCurrent.split('?')[0] !== pathname ? recordedCurrent : null,
        recordedPrevious,
      ]

      // A form is passed over for the entry before it (see isFormPage), and so
      // is this page itself: after an edit, the page before the form is often
      // the very record on screen, and Back to it would go nowhere.
      const source = candidates.find(
        (url): url is string => !!url && !isFormPage(url) && url.split('?')[0] !== pathname
      )

      if (!source) return
      const label = labelFor(source)
      // An unrecognised route gets the fallback wording rather than a guess:
      // better a slightly generic label than a confidently wrong one.
      setPrevious({ href: source, label: label ?? fallbackLabel })
    } catch {
      // Storage unavailable — the fallback below is already correct.
    }
  }, [fallbackLabel, pathname])

  const href = previous?.href ?? fallbackHref
  const label = previous?.label ?? fallbackLabel

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}
