import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { InquiryForm } from '@/components/inquiries/inquiry-form'
import { requireProfile } from '@/lib/auth'
import { getFormOptions } from '@/lib/queries/inquiries'

export const metadata: Metadata = { title: 'New inquiry · Inquiry Tracking System' }
export const dynamic = 'force-dynamic'

export default async function NewInquiryPage() {
  const [profile, { companies, staff }] = await Promise.all([requireProfile(), getFormOptions()])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/inquiries"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to inquiries
      </Link>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Log an inquiry</h2>
        <p className="text-sm text-muted-foreground">
          The inquiry number is assigned automatically once you save.
        </p>
      </div>

      <InquiryForm
        mode="create"
        companies={companies}
        staff={staff}
        currentUserId={profile.id}
      />
    </div>
  )
}
