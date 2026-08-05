import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { InquiryForm } from '@/components/inquiries/inquiry-form'
import { requireProfile } from '@/lib/auth'
import { getFormOptions, getInquiryDetail } from '@/lib/queries/inquiries'

export const metadata: Metadata = { title: 'Edit inquiry · Inquiry Tracking System' }
export const dynamic = 'force-dynamic'

export default async function EditInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [profile, detail, { companies, staff }] = await Promise.all([
    requireProfile(),
    getInquiryDetail(id),
    getFormOptions(),
  ])

  if (!detail) notFound()

  const { inquiry } = detail

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/inquiries/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {inquiry.inquiry_no ?? 'inquiry'}
      </Link>

      <h2 className="text-xl font-semibold tracking-tight">
        Edit {inquiry.inquiry_no ?? 'inquiry'}
      </h2>

      <InquiryForm
        mode="edit"
        companies={companies}
        staff={staff}
        currentUserId={profile.id}
        initial={{
          id: inquiry.id,
          companyId: inquiry.company_id,
          contactId: inquiry.contact_id,
          contacts: detail.contacts.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            designation: c.designation,
            is_primary: c.is_primary,
          })),
          values: {
            inquiry_date: inquiry.inquiry_date,
            source: inquiry.source ?? '',
            requirement_summary: inquiry.requirement_summary,
            estimated_value: inquiry.estimated_value != null ? String(inquiry.estimated_value) : '',
            status: inquiry.status,
            priority: inquiry.priority,
            owner_id: inquiry.owner_id ?? '',
            lost_reason: inquiry.lost_reason ?? '',
          },
        }}
      />
    </div>
  )
}
