'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Building2, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CURRENCY, GST_STATES } from '@/lib/constants'
import { saveCompanySettings } from '@/app/(app)/documents/actions'
import type { CompanySettingsRow } from '@/types/database'

type Props = {
  settings: CompanySettingsRow | null
  missing: string[]
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))

/**
 * ANK's own details, as they appear on every document raised.
 *
 * None of this lives in the code. A GSTIN change, a move to another state or
 * a new bank account is an edit here, not a new deployment. The form saves
 * half-finished on purpose — the completeness check happens at the moment a
 * document is issued, which is where it matters.
 */
export function CompanySettingsForm({ settings, missing }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    legal_name: str(settings?.legal_name),
    trade_name: str(settings?.trade_name),
    address_line1: str(settings?.address_line1),
    address_line2: str(settings?.address_line2),
    city: str(settings?.city),
    state_code: str(settings?.state_code),
    state_name: str(settings?.state_name),
    pincode: str(settings?.pincode),
    gstin: str(settings?.gstin),
    pan: str(settings?.pan),
    phone: str(settings?.phone),
    email: str(settings?.email),
    website: str(settings?.website),
    bank_name: str(settings?.bank_name),
    bank_account_no: str(settings?.bank_account_no),
    bank_ifsc: str(settings?.bank_ifsc),
    bank_branch: str(settings?.bank_branch),
    signatory_name: str(settings?.signatory_name),
    signatory_designation: str(settings?.signatory_designation),
    default_gst_rate: str(settings?.default_gst_rate ?? 18),
    default_currency: settings?.default_currency ?? 'INR',
    invoice_terms: str(settings?.invoice_terms),
  })

  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value })

  function submit() {
    setErrors({})
    startTransition(async () => {
      const result = await saveCompanySettings(form)
      if (result.ok) {
        toast.success('Company details saved')
        router.refresh()
      } else {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          Company &amp; tax details
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {missing.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-overdue/40 bg-overdue/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-overdue" aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-overdue">
                No document can be issued until this is complete
              </p>
              <p className="text-muted-foreground">
                Still needed: {missing.join(', ')}. Drafts can be prepared in the meantime — only
                issuing is blocked.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-ok/40 bg-ok/5 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
            <p className="text-sm">
              Complete. Invoices, proformas and challans can be issued.
            </p>
          </div>
        )}

        <section className="space-y-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Identity
          </h4>

          <Field
            label="Registered legal name"
            htmlFor="legal_name"
            error={errors.legal_name}
            hint="Exactly as on the GST certificate"
          >
            <Input
              id="legal_name"
              value={form.legal_name}
              placeholder="ANK Design & Automation Solutions LLP"
              onChange={(e) => set('legal_name')(e.target.value)}
            />
          </Field>

          <Field label="Trading name" htmlFor="trade_name" error={errors.trade_name}>
            <Input
              id="trade_name"
              value={form.trade_name}
              onChange={(e) => set('trade_name')(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GSTIN" htmlFor="gstin" error={errors.gstin}>
              <Input
                id="gstin"
                value={form.gstin}
                placeholder="24AAAAA0000A1Z5"
                onChange={(e) => set('gstin')(e.target.value.toUpperCase())}
              />
            </Field>

            <Field label="PAN" htmlFor="pan" error={errors.pan}>
              <Input
                id="pan"
                value={form.pan}
                placeholder="AAAAA0000A"
                onChange={(e) => set('pan')(e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t pt-5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Registered address
          </h4>

          <Field label="Address line 1" htmlFor="address_line1" error={errors.address_line1}>
            <Input
              id="address_line1"
              value={form.address_line1}
              onChange={(e) => set('address_line1')(e.target.value)}
            />
          </Field>

          <Field label="Address line 2" htmlFor="address_line2" error={errors.address_line2}>
            <Input
              id="address_line2"
              value={form.address_line2}
              onChange={(e) => set('address_line2')(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" htmlFor="city" error={errors.city}>
              <Input id="city" value={form.city} onChange={(e) => set('city')(e.target.value)} />
            </Field>

            <Field
              label="State"
              htmlFor="state_code"
              error={errors.state_code}
              hint="Decides CGST+SGST vs IGST"
            >
              <Select
                id="state_code"
                value={form.state_code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    state_code: e.target.value,
                    state_name: GST_STATES[e.target.value] ?? '',
                  })
                }
              >
                <option value="">Select a state</option>
                {Object.entries(GST_STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} — {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="PIN code" htmlFor="pincode" error={errors.pincode}>
              <Input
                id="pincode"
                inputMode="numeric"
                value={form.pincode}
                onChange={(e) => set('pincode')(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Phone" htmlFor="phone" error={errors.phone}>
              <Input id="phone" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
            </Field>
            <Field label="Website" htmlFor="website" error={errors.website}>
              <Input
                id="website"
                value={form.website}
                onChange={(e) => set('website')(e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t pt-5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bank details, printed on invoices
          </h4>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank name" htmlFor="bank_name" error={errors.bank_name}>
              <Input
                id="bank_name"
                value={form.bank_name}
                onChange={(e) => set('bank_name')(e.target.value)}
              />
            </Field>
            <Field label="Branch" htmlFor="bank_branch" error={errors.bank_branch}>
              <Input
                id="bank_branch"
                value={form.bank_branch}
                onChange={(e) => set('bank_branch')(e.target.value)}
              />
            </Field>
            <Field label="Account number" htmlFor="bank_account_no" error={errors.bank_account_no}>
              <Input
                id="bank_account_no"
                value={form.bank_account_no}
                onChange={(e) => set('bank_account_no')(e.target.value)}
              />
            </Field>
            <Field label="IFSC" htmlFor="bank_ifsc" error={errors.bank_ifsc}>
              <Input
                id="bank_ifsc"
                value={form.bank_ifsc}
                placeholder="HDFC0001234"
                onChange={(e) => set('bank_ifsc')(e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t pt-5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Invoice defaults
          </h4>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Default GST rate (%)"
              htmlFor="default_gst_rate"
              error={errors.default_gst_rate}
              hint="Applied to new lines; per-line rates can differ"
            >
              <Input
                id="default_gst_rate"
                inputMode="decimal"
                value={form.default_gst_rate}
                onChange={(e) => set('default_gst_rate')(e.target.value)}
              />
            </Field>
            <Field
              label="Default currency"
              htmlFor="default_currency"
              error={errors.default_currency}
              hint="Pre-selected on a new inquiry. Tax documents stay in INR."
            >
              <Select
                id="default_currency"
                value={form.default_currency}
                onChange={(e) => set('default_currency')(e.target.value)}
              >
                {optionsFrom(CURRENCY)}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Signatory name" htmlFor="signatory_name" error={errors.signatory_name}>
              <Input
                id="signatory_name"
                value={form.signatory_name}
                onChange={(e) => set('signatory_name')(e.target.value)}
              />
            </Field>
            <Field
              label="Signatory designation"
              htmlFor="signatory_designation"
              error={errors.signatory_designation}
            >
              <Input
                id="signatory_designation"
                value={form.signatory_designation}
                placeholder="Authorised Signatory"
                onChange={(e) => set('signatory_designation')(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Terms and conditions"
            htmlFor="invoice_terms"
            error={errors.invoice_terms}
            hint="Printed at the foot of every document"
          >
            <Textarea
              id="invoice_terms"
              rows={4}
              value={form.invoice_terms}
              placeholder="Payment due within 30 days. Goods once sold will not be taken back. Subject to Ahmedabad jurisdiction."
              onChange={(e) => set('invoice_terms')(e.target.value)}
            />
          </Field>
        </section>

        <div className="flex justify-end border-t pt-4">
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save company details
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
