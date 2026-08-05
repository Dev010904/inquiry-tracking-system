import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/components/rnd/project-form'
import { requireProfile } from '@/lib/auth'
import { getRndFormOptions } from '@/lib/queries/rnd'

export const metadata: Metadata = { title: 'New R&D project · Inquiry Tracking System' }
export const dynamic = 'force-dynamic'

export default async function NewRndProjectPage() {
  const [profile, { staff }] = await Promise.all([requireProfile(), getRndFormOptions()])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/rnd"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to projects
      </Link>

      <h2 className="text-xl font-semibold tracking-tight">Start an R&amp;D project</h2>

      <ProjectForm mode="create" staff={staff} currentUserId={profile.id} />
    </div>
  )
}
