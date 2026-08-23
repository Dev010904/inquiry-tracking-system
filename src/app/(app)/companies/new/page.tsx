import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CompanyForm } from '@/components/companies/company-form'
import { currentAccess } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Add a client · ANK Inquiry Tracking' }
export const dynamic = 'force-dynamic'

/**
 * Adding a client without going through an inquiry first.
 *
 * The inline form on the inquiry screen stays where it is — that is still the
 * right route for a client who turns up with a requirement. This exists for the
 * other case: setting a client up properly, with GSTIN and billing address,
 * before there is any work to attach them to.
 *
 * Gated the same way as the edit screen. The section layout has established
 * that this role may see Companies; creating one is a second grant, and a role
 * holding only view has no business reaching a form that would refuse to save.
 */
export default async function NewCompanyPage() {
  const { features } = await currentAccess()
  if (!features.companies.canEdit) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/companies"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to companies
      </Link>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Add a client</h2>
        <p className="text-sm text-muted-foreground">
          Contacts are added on the client&rsquo;s own page once this is saved.
        </p>
      </div>

      <CompanyForm
        id={null}
        values={{
          name: '',
          type: 'company',
          address: '',
          city: '',
          state: '',
          gstin: '',
          // On by default: most clients are registered, and a bill of supply
          // raised for one who is not exempt is the more expensive mistake.
          gst_applicable: true,
          gst_exemption_reason: '',
          notes: '',
        }}
      />
    </div>
  )
}
