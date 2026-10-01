import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/components/rnd/project-form'
import { requireProfile } from '@/lib/auth'
import { getRndFormOptions, getRndProjectDetail } from '@/lib/queries/rnd'

export const metadata: Metadata = { title: 'Edit project · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function EditRndProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [profile, detail, { staff }] = await Promise.all([
    requireProfile(),
    getRndProjectDetail(id),
    getRndFormOptions(),
  ])

  if (!detail) notFound()
  const { project } = detail

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/rnd/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {project.project_code ?? 'project'}
      </Link>

      <h2 className="text-xl font-semibold tracking-tight">Edit {project.project_name}</h2>

      <ProjectForm
        mode="edit"
        staff={staff}
        currentUserId={profile.id}
        initial={{
          id: project.id,
          values: {
            project_code: project.project_code ?? '',
            project_name: project.project_name,
            description: project.description ?? '',
            approx_budget: project.approx_budget != null ? String(project.approx_budget) : '',
            currency: project.currency,
            start_date: project.start_date ?? '',
            target_date: project.target_date ?? '',
            actual_end_date: project.actual_end_date ?? '',
            stage: project.stage,
            lead_id: project.lead_id ?? '',
            notes: project.notes ?? '',
          },
        }}
      />
    </div>
  )
}
