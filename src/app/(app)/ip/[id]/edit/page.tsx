import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { IpForm } from '@/components/ip/ip-form'
import { getIpAssetDetail, getIpFormOptions } from '@/lib/queries/ip'

export const metadata: Metadata = { title: 'Edit IP asset · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function EditIpAssetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [detail, { projects }] = await Promise.all([getIpAssetDetail(id), getIpFormOptions()])
  if (!detail) notFound()

  const { asset } = detail

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/ip/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to asset
      </Link>

      <h2 className="text-lg font-semibold tracking-tight">Edit {asset.title}</h2>

      <IpForm
        mode="edit"
        projects={projects}
        initial={{
          id: asset.id,
          values: {
            title: asset.title,
            ip_type: asset.ip_type,
            status: asset.status,
            protection_route: asset.protection_route ?? '',
            jurisdiction: asset.jurisdiction,
            application_no: asset.application_no ?? '',
            registration_no: asset.registration_no ?? '',
            rnd_project_id: asset.rnd_project_id ?? '',
            filing_date: asset.filing_date ?? '',
            publication_date: asset.publication_date ?? '',
            grant_date: asset.grant_date ?? '',
            expiry_date: asset.expiry_date ?? '',
            next_renewal_date: asset.next_renewal_date ?? '',
            inventors: asset.inventors.join(', '),
            owner_entity: asset.owner_entity ?? '',
            attorney_firm: asset.attorney_firm ?? '',
            attorney_contact: asset.attorney_contact ?? '',
            confidentiality: asset.confidentiality,
            notes: asset.notes ?? '',
          },
        }}
      />
    </div>
  )
}
