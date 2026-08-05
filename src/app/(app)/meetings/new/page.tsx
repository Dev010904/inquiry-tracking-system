import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { MeetingForm } from '@/components/quality/meeting-form'
import { Card, CardContent } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'New minutes · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireProfile()
  const params = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  const supabase = await createClient()
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to meetings
      </Link>

      <h2 className="text-xl font-semibold tracking-tight">New minutes</h2>

      <Card>
        <CardContent className="pt-6">
          <MeetingForm
            companies={companies ?? []}
            defaults={{
              company_id: one(params.company),
              order_id: one(params.order),
              inquiry_id: one(params.inquiry),
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
