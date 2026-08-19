import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { currentFy, fyOf, fyRange, isFy } from '@/lib/fy'
import { settingsManagerOrNull } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/** The cookie holding a chosen year. Read on every request; never trusted blindly. */
export const FY_COOKIE = 'ank_fy'

export type ActiveFy = {
  /** The year the screens are showing. */
  fy: string
  /** The year we are actually in — what the system falls back to. */
  current: string
  /** True when the viewer is looking at a year that has closed. */
  isPast: boolean
  /** Whether this viewer is allowed to change the year at all. */
  canSwitch: boolean
  /** Inclusive date bounds of `fy`, for scoping queries. */
  from: string
  to: string
}

/**
 * Which financial year this request is looking at.
 *
 * The rules, in order, and the order is the point:
 *
 *  1. The system always starts in the year we are actually in. A staff member
 *     who has never touched the setting opens the app on 1 April and sees an
 *     empty year, which is what the owner asked for.
 *  2. Only someone who can manage Settings may look at another year. For
 *     everyone else the cookie is ignored outright rather than rejected —
 *     a copied cookie must not become a way to read last year's books.
 *  3. A cookie that is not a financial-year label, or is in the future, is
 *     discarded. Nothing downstream has to defend itself against a hand-edited
 *     value, because an invalid one never survives this function.
 *
 * Cached per request, so the dozen queries a page runs all agree on the year
 * even if the cookie were to change underneath them.
 */
export const activeFy = cache(async (): Promise<ActiveFy> => {
  const current = currentFy()
  const manager = await settingsManagerOrNull()
  const canSwitch = manager !== null

  let fy = current
  if (canSwitch) {
    const chosen = (await cookies()).get(FY_COOKIE)?.value
    // Never allow a future year: it would show an empty system with no
    // explanation and let someone file records into a year that has not begun.
    if (isFy(chosen) && chosen <= current) fy = chosen
  }

  return { fy, current, isPast: fy !== current, canSwitch, ...fyRange(fy) }
})

/**
 * The earliest financial year holding any data, or null for a fresh system.
 *
 * Read from the records themselves rather than from a setting, so the picker
 * offers exactly the years the business traded in. Three cheap indexed reads
 * of one row each; the alternative — a `min()` across three tables — cannot
 * use the index and gets slower every year.
 */
export const earliestFy = cache(async (): Promise<string | null> => {
  const supabase = await createClient()

  const [inquiry, order, invoice] = await Promise.all([
    supabase.from('inquiries').select('inquiry_date').order('inquiry_date').limit(1).maybeSingle(),
    supabase.from('orders').select('order_date').order('order_date').limit(1).maybeSingle(),
    supabase.from('invoices').select('doc_date').order('doc_date').limit(1).maybeSingle(),
  ])

  const dates = [
    inquiry.data?.inquiry_date,
    order.data?.order_date,
    invoice.data?.doc_date,
  ].filter((d): d is string => Boolean(d))

  if (dates.length === 0) return null
  return fyOf(dates.sort()[0]!)
})
