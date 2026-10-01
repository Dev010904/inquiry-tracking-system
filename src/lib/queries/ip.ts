import 'server-only'

import { cache } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { DEAD_IP_STATUSES } from '@/lib/constants'
import type { IpAssetRow, IpEventRow, IpStatus, IpType } from '@/types/database'

export type IpAssetCard = {
  id: string
  title: string
  ipType: IpType
  status: IpStatus
  jurisdiction: string
  applicationNo: string | null
  registrationNo: string | null
  filingDate: string | null
  grantDate: string | null
  expiryDate: string | null
  nextRenewalDate: string | null
  costToDate: number
  inventors: string[]
  confidentiality: IpAssetRow['confidentiality']
  projectName: string | null
  projectId: string | null
  /** Days until the next renewal; negative means it has passed. */
  daysToRenewal: number | null
  renewalOverdue: boolean
  /** Refused, abandoned or lapsed — nothing left to chase. */
  isDead: boolean
}

function indexBy<T extends { id: string }>(rows: T[] | null | undefined): Map<string, T> {
  return new Map((rows ?? []).map((row) => [row.id, row]))
}

function toCard(
  asset: IpAssetRow,
  projectName: string | null,
  now: Date
): IpAssetCard {
  const today = new Date(now.toISOString().slice(0, 10))
  const days = asset.next_renewal_date
    ? differenceInCalendarDays(new Date(asset.next_renewal_date), today)
    : null
  const dead = DEAD_IP_STATUSES.includes(asset.status as (typeof DEAD_IP_STATUSES)[number])

  return {
    id: asset.id,
    title: asset.title,
    ipType: asset.ip_type,
    status: asset.status,
    jurisdiction: asset.jurisdiction,
    applicationNo: asset.application_no,
    registrationNo: asset.registration_no,
    filingDate: asset.filing_date,
    grantDate: asset.grant_date,
    expiryDate: asset.expiry_date,
    nextRenewalDate: asset.next_renewal_date,
    costToDate: Number(asset.cost_to_date ?? 0),
    inventors: asset.inventors ?? [],
    confidentiality: asset.confidentiality,
    projectName,
    projectId: asset.rnd_project_id,
    daysToRenewal: days,
    // A lapsed patent has no renewal to miss, so it is never "overdue".
    renewalOverdue: days !== null && days < 0 && !dead,
    isDead: dead,
  }
}

/**
 * IP assets visible to the signed-in user.
 *
 * Restricted assets are filtered by the `can_see_ip()` policy in Postgres, not
 * here — a staff member who is not the owning project's lead simply receives
 * fewer rows. The app never needs to reason about it.
 */
export async function listIpAssets(
  filters: { type?: IpType; status?: IpStatus } = {},
  now = new Date()
): Promise<IpAssetCard[]> {
  const supabase = await createClient()

  let query = supabase
    .from('ip_assets')
    .select('*')
    .is('deleted_at', null)
    .order('next_renewal_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filters.type) query = query.eq('ip_type', filters.type)
  if (filters.status) query = query.eq('status', filters.status)

  const { data: assets } = await query
  if (!assets?.length) return []

  const projectIds = [
    ...new Set(assets.map((a) => a.rnd_project_id).filter((id): id is string => Boolean(id))),
  ]
  const { data: projects } = projectIds.length
    ? await supabase.from('rnd_projects').select('id, project_name').in('id', projectIds)
    : { data: [] as { id: string; project_name: string }[] }
  const projectById = indexBy(projects)

  return assets.map((asset) =>
    toCard(
      asset,
      asset.rnd_project_id ? (projectById.get(asset.rnd_project_id)?.project_name ?? null) : null,
      now
    )
  )
}

export type IpAssetDetail = {
  asset: IpAssetRow
  card: IpAssetCard
  events: (IpEventRow & { authorName: string | null })[]
  projectName: string | null
}

async function loadIpAssetDetail(
  id: string,
  now = new Date()
): Promise<IpAssetDetail | null> {
  const supabase = await createClient()

  const { data: asset } = await supabase
    .from('ip_assets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!asset) return null

  const [eventsRes, projectRes] = await Promise.all([
    supabase
      .from('ip_events')
      .select('*')
      .eq('ip_asset_id', id)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false }),
    asset.rnd_project_id
      ? supabase
          .from('rnd_projects')
          .select('project_name')
          .eq('id', asset.rnd_project_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const events = eventsRes.data ?? []
  const authorIds = [
    ...new Set(events.map((e) => e.author_id).filter((v): v is string => Boolean(v))),
  ]
  const { data: authors } = authorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] as { id: string; full_name: string }[] }
  const authorById = indexBy(authors)

  const projectName = projectRes.data?.project_name ?? null

  return {
    asset,
    card: toCard(asset, projectName, now),
    events: events.map((event) => ({
      ...event,
      authorName: event.author_id ? (authorById.get(event.author_id)?.full_name ?? null) : null,
    })),
    projectName,
  }
}

/** R&D projects, for linking an asset to the work that produced it. */
export async function getIpFormOptions() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rnd_projects')
    .select('id, project_name, project_code')
    .is('deleted_at', null)
    .order('project_name')
  return { projects: data ?? [] }
}

/**
 * Cached for the request. The page's generateMetadata and the page itself both
 * ask for the same record, and every one of these loaders is several queries —
 * without this the whole set ran twice on every visit.
 */
export const getIpAssetDetail = cache(loadIpAssetDetail)
