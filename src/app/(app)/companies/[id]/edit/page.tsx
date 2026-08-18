import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CompanyForm } from '@/components/companies/company-form'
import { currentAccess } from '@/lib/permissions'
import { getCompanyDetail } from '@/lib/queries/companies'

export const metadata: Metadata = { title: 'Edit client · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // The section layout has already established that this role may *see*
  // Companies. Editing is a second grant, and a role holding only view has no
  // business reaching this screen — 404 rather than a form that saves nothing.
  const [{ features }, detail] = await Promise.all([currentAccess(), getCompanyDetail(id)])
  if (!features.companies.canEdit) notFound()
  if (!detail) notFound()

  const { company } = detail

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/companies/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {company.name}
      </Link>

      <h2 className="text-xl font-semibold tracking-tight">Edit {company.name}</h2>

      <CompanyForm
        id={company.id}
        values={{
          name: company.name,
          type: company.type,
          address: company.address ?? '',
          city: company.city ?? '',
          state: company.state ?? '',
          gstin: company.gstin ?? '',
          gst_applicable: company.gst_applicable,
          gst_exemption_reason: company.gst_exemption_reason ?? '',
          notes: company.notes ?? '',
        }}
      />
    </div>
  )
}
