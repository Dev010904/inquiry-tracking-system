import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { FollowupChannel } from '@/types/database'

export type MyFollowup = {
  id: string
  inquiryId: string
  inquiryNo: string | null
  companyName: string | null
  note: string
  channel: FollowupChannel
  /** `snoozed_to` where one is set, otherwise `due_at`. */
  effectiveDue: string
}

/**
 * The signed-in person's own outstanding follow-ups.
 *
 * Deliberately narrow. This feeds the My work dashboard, which exists for
 * someone whose role withholds the commercial dashboard, so it carries no
 * value, no totals and no company-wide counts — only the work that is theirs.
 * A snoozed follow-up is sorted by where it was snoozed to, matching how the
 * alarm panel treats one.
 */
export async function getMyFollowups(userId: string, now = new Date()): Promise<MyFollowup[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('followups')
    .select('id, inquiry_id, due_at, snoozed_to, channel, note')
    .eq('assigned_to', userId)
    .eq('is_done', false)
    .order('due_at')
    .limit(50)

  const rows = data ?? []
  if (rows.length === 0) return []

  // Deleted inquiries excluded, and their follow-ups dropped below — the same
  // rule the alarm panel applies. Nothing cascades from an inquiry to its
  // follow-ups, so a deleted one would otherwise sit in someone's work list
  // pointing at a record they cannot open.
  const { data: inquiries } = await supabase
    .from('inquiries')
    .select('id, inquiry_no, companies(name)')
    .in('id', [...new Set(rows.map((row) => row.inquiry_id))])
    .is('deleted_at', null)

  const context = new Map(
    (inquiries ?? []).map((row) => {
      const company = row.companies as unknown as { name: string } | { name: string }[] | null
      const name = Array.isArray(company) ? (company[0]?.name ?? null) : (company?.name ?? null)
      return [row.id, { inquiryNo: row.inquiry_no as string | null, companyName: name }]
    })
  )

  const horizon = new Date(now)
  horizon.setDate(horizon.getDate() + 14)

  return rows
    .filter((row) => context.has(row.inquiry_id))
    .map((row) => ({
      id: row.id,
      inquiryId: row.inquiry_id,
      inquiryNo: context.get(row.inquiry_id)?.inquiryNo ?? null,
      companyName: context.get(row.inquiry_id)?.companyName ?? null,
      note: row.note,
      channel: row.channel as FollowupChannel,
      effectiveDue: row.snoozed_to ?? row.due_at,
    }))
    // Anything already due, plus the next fortnight. Further out is planning,
    // not work due, and would bury what actually needs doing.
    .filter((row) => new Date(row.effectiveDue) <= horizon)
    .sort((a, b) => (a.effectiveDue < b.effectiveDue ? -1 : 1))
}
