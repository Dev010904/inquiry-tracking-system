import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { IpForm } from '@/components/ip/ip-form'
import { getIpFormOptions } from '@/lib/queries/ip'

export const metadata: Metadata = { title: 'New IP asset · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function NewIpAssetPage() {
  const { projects } = await getIpFormOptions()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/ip"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to portfolio
      </Link>

      <h2 className="text-xl font-semibold tracking-tight">Add an IP asset</h2>

      <IpForm mode="create" projects={projects} />
    </div>
  )
}
