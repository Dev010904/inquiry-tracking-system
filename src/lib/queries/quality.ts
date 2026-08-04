import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { QA_BUCKET, QUALIFICATION_STAGE } from '@/lib/constants'
import type {
  MeetingActionRow,
  MeetingRow,
  QaCheckRow,
  QaMediaRow,
  QualificationRow,
  QualificationStage,
} from '@/types/database'

export type QaMediaWithUrl = QaMediaRow & { signedUrl: string | null }
export type QaCheckWithMedia = QaCheckRow & {
  media: QaMediaWithUrl[]
  checkedByName: string | null
  /** Description, at least one photo and at least one video. */
  isComplete: boolean
}

/**
 * QA checks on an order, with signed URLs for the uploaded photos.
 *
 * The bucket is private, so nothing is readable by URL alone. Links are
 * signed for an hour, which is long enough to look at a report and short
 * enough that a copied link is not a permanent leak.
 */
export async function listQaChecks(orderId: string): Promise<QaCheckWithMedia[]> {
  const supabase = await createClient()

  const { data: checks } = await supabase
    .from('qa_checks')
    .select('*')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .order('checked_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (!checks || checks.length === 0) return []

  const [{ data: media }, { data: people }] = await Promise.all([
    supabase
      .from('qa_media')
      .select('*')
      .in(
        'qa_check_id',
        checks.map((c) => c.id)
      )
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .in(
        'id',
        [...new Set(checks.map((c) => c.checked_by).filter((v): v is string => Boolean(v)))]
      ),
  ])

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]))

  const paths = (media ?? [])
    .map((m) => m.storage_path)
    .filter((v): v is string => Boolean(v))

  const signedByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(QA_BUCKET)
      .createSignedUrls(paths, 60 * 60)
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl)
    }
  }

  return checks.map((check) => {
    const own = (media ?? [])
      .filter((m) => m.qa_check_id === check.id)
      .map((m) => ({
        ...m,
        signedUrl: m.storage_path ? (signedByPath.get(m.storage_path) ?? null) : m.external_url,
      }))

    return {
      ...check,
      media: own,
      checkedByName: check.checked_by ? (nameById.get(check.checked_by) ?? null) : null,
      isComplete:
        check.description.trim().length > 0 &&
        own.some((m) => m.kind === 'photo') &&
        own.some((m) => m.kind === 'video'),
    }
  })
}

/** Whether this order is allowed to be dispatched, and why not if it is not. */
export function dispatchBlockReason(checks: QaCheckWithMedia[]): string | null {
  const passing = checks.filter((c) => c.result === 'pass' || c.result === 'conditional_pass')
  if (passing.length === 0) return 'No QA check has been passed for this order yet.'
  if (!passing.some((c) => c.isComplete)) {
    const missing: string[] = []
    const best = passing[0]!
    if (!best.media.some((m) => m.kind === 'photo')) missing.push('a photo')
    if (!best.media.some((m) => m.kind === 'video')) missing.push('a video link')
    return `The QA check still needs ${missing.join(' and ')}.`
  }
  return null
}

/**
 * The four qualification stages for an order, in order, filling in any that
 * have never been started so the tracker always shows all four.
 */
export async function listQualifications(orderId: string): Promise<
  (Partial<QualificationRow> & { stage: QualificationStage })[]
> {
  const supabase = await createClient()
  const { data } = await supabase.from('qualifications').select('*').eq('order_id', orderId)

  const byStage = new Map((data ?? []).map((row) => [row.stage, row]))
  return (Object.keys(QUALIFICATION_STAGE) as QualificationStage[]).map(
    (stage) => byStage.get(stage) ?? { stage, order_id: orderId, status: 'not_started' as const }
  )
}

export type MeetingWithActions = MeetingRow & {
  actions: MeetingActionRow[]
  companyName: string | null
}

export async function listMeetings(filters: {
  companyId?: string
  orderId?: string
  inquiryId?: string
  limit?: number
}): Promise<MeetingWithActions[]> {
  const supabase = await createClient()

  let query = supabase.from('meetings').select('*').is('deleted_at', null)
  if (filters.companyId) query = query.eq('company_id', filters.companyId)
  if (filters.orderId) query = query.eq('order_id', filters.orderId)
  if (filters.inquiryId) query = query.eq('inquiry_id', filters.inquiryId)

  const { data: meetings } = await query
    .order('meeting_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100)

  if (!meetings || meetings.length === 0) return []

  const [{ data: actions }, { data: companies }] = await Promise.all([
    supabase
      .from('meeting_actions')
      .select('*')
      .in(
        'meeting_id',
        meetings.map((m) => m.id)
      )
      .order('due_on', { ascending: true }),
    supabase
      .from('companies')
      .select('id, name')
      .in(
        'id',
        [...new Set(meetings.map((m) => m.company_id).filter((v): v is string => Boolean(v)))]
      ),
  ])

  const nameById = new Map((companies ?? []).map((c) => [c.id, c.name]))

  return meetings.map((meeting) => ({
    ...meeting,
    actions: (actions ?? []).filter((a) => a.meeting_id === meeting.id),
    companyName: meeting.company_id ? (nameById.get(meeting.company_id) ?? null) : null,
  }))
}

export async function getMeeting(id: string): Promise<MeetingWithActions | null> {
  const supabase = await createClient()
  const { data: meeting } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle()
  if (!meeting) return null

  const [{ data: actions }, { data: company }] = await Promise.all([
    supabase
      .from('meeting_actions')
      .select('*')
      .eq('meeting_id', id)
      .order('due_on', { ascending: true }),
    meeting.company_id
      ? supabase.from('companies').select('id, name').eq('id', meeting.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    ...meeting,
    actions: actions ?? [],
    companyName: company?.name ?? null,
  }
}
