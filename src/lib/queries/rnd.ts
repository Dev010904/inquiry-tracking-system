import 'server-only'

import { cache } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type {
  CurrencyCode,
  IpAssetRow,
  RndExpenseRow,
  RndProjectRow,
  RndStage,
  WorkUpdateRow,
} from '@/types/database'

/** Stages where the project is finished and no longer "running late". */
const CLOSED_STAGES: RndStage[] = ['completed', 'shelved']

export type RndProjectCard = {
  id: string
  projectCode: string | null
  projectName: string
  description: string | null
  approxBudget: number | null
  spentToDate: number
  currency: CurrencyCode
  /** Percentage of budget consumed; null when no budget is set. */
  budgetPct: number | null
  overBudget: boolean
  startDate: string | null
  targetDate: string | null
  actualEndDate: string | null
  stage: RndStage
  progressPct: number
  leadName: string | null
  /** Target date has passed and the project is neither completed nor shelved. */
  overdue: boolean
  daysToTarget: number | null
}

function indexBy<T extends { id: string }>(rows: T[] | null | undefined): Map<string, T> {
  return new Map((rows ?? []).map((row) => [row.id, row]))
}

function toCard(
  project: RndProjectRow,
  leadName: string | null,
  now: Date
): RndProjectCard {
  const budget = project.approx_budget != null ? Number(project.approx_budget) : null
  const spent = Number(project.spent_to_date ?? 0)
  const closed = CLOSED_STAGES.includes(project.stage)

  return {
    id: project.id,
    projectCode: project.project_code,
    projectName: project.project_name,
    description: project.description,
    approxBudget: budget,
    spentToDate: spent,
    currency: project.currency,
    budgetPct: budget && budget > 0 ? Math.round((spent / budget) * 100) : null,
    overBudget: Boolean(budget && budget > 0 && spent > budget),
    startDate: project.start_date,
    targetDate: project.target_date,
    actualEndDate: project.actual_end_date,
    stage: project.stage,
    progressPct: project.progress_pct,
    leadName,
    overdue: Boolean(
      project.target_date && !closed && new Date(project.target_date) < new Date(now.toISOString().slice(0, 10))
    ),
    daysToTarget: project.target_date
      ? differenceInCalendarDays(new Date(project.target_date), new Date(now.toISOString().slice(0, 10)))
      : null,
  }
}

/**
 * All live projects, newest first, with the lead resolved.
 *
 * R&D is a small set by nature — a handful of projects, not thousands — so
 * this deliberately returns everything rather than paginating. The timeline
 * view needs the whole set anyway to work out its date range.
 */
export async function listRndProjects(stage?: RndStage, now = new Date()): Promise<RndProjectCard[]> {
  const supabase = await createClient()

  let query = supabase
    .from('rnd_projects')
    .select('*')
    .is('deleted_at', null)
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (stage) query = query.eq('stage', stage)

  const { data: projects } = await query
  if (!projects?.length) return []

  const leadIds = [
    ...new Set(projects.map((p) => p.lead_id).filter((id): id is string => Boolean(id))),
  ]
  const { data: leads } = leadIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', leadIds)
    : { data: [] as { id: string; full_name: string }[] }
  const leadById = indexBy(leads)

  return projects.map((project) =>
    toCard(project, project.lead_id ? (leadById.get(project.lead_id)?.full_name ?? null) : null, now)
  )
}

export type RndProjectDetail = {
  project: RndProjectRow
  card: RndProjectCard
  expenses: RndExpenseRow[]
  workUpdates: (WorkUpdateRow & { authorName: string | null })[]
  ipAssets: Pick<IpAssetRow, 'id' | 'title' | 'ip_type' | 'status' | 'next_renewal_date'>[]
}

async function loadRndProjectDetail(
  id: string,
  now = new Date()
): Promise<RndProjectDetail | null> {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('rnd_projects')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!project) return null

  const [expensesRes, updatesRes, ipRes, leadRes] = await Promise.all([
    supabase
      .from('rnd_expenses')
      .select('*')
      .eq('project_id', id)
      .is('deleted_at', null)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('work_updates')
      .select('*')
      .eq('parent_type', 'rnd')
      .eq('parent_id', id)
      .order('update_date', { ascending: false })
      .order('created_at', { ascending: false }),
    // Restricted IP rows are filtered by RLS via can_see_ip(), so a staff
    // member who should not see them simply gets fewer rows here.
    supabase
      .from('ip_assets')
      .select('id, title, ip_type, status, next_renewal_date')
      .eq('rnd_project_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    project.lead_id
      ? supabase.from('profiles').select('full_name').eq('id', project.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const updates = updatesRes.data ?? []
  const authorIds = [
    ...new Set(updates.map((u) => u.author_id).filter((v): v is string => Boolean(v))),
  ]
  const { data: authors } = authorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', authorIds)
    : { data: [] as { id: string; full_name: string }[] }
  const authorById = indexBy(authors)

  return {
    project,
    card: toCard(project, leadRes.data?.full_name ?? null, now),
    expenses: expensesRes.data ?? [],
    workUpdates: updates.map((update) => ({
      ...update,
      authorName: update.author_id ? (authorById.get(update.author_id)?.full_name ?? null) : null,
    })),
    ipAssets: ipRes.data ?? [],
  }
}

/** Active staff, for the project lead picker. */
export async function getRndFormOptions() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')
  return { staff: data ?? [] }
}

/**
 * Cached for the request. The page's generateMetadata and the page itself both
 * ask for the same record, and every one of these loaders is several queries —
 * without this the whole set ran twice on every visit.
 */
export const getRndProjectDetail = cache(loadRndProjectDetail)
