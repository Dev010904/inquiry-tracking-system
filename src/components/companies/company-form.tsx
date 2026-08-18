'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { COMPANY_TYPE, gstStateFor } from '@/lib/constants'
import { companySchema } from '@/lib/schemas/company'
import { updateCompany } from '@/app/(app)/companies/actions'
import type { CompanyType } from '@/types/database'

type Fields = {
  name: string
  type: CompanyType
  address: string
  city: string
  state: string
  gstin: string
  gst_applicable: boolean
  gst_exemption_reason: string
  notes: string
}

type Props = { id: string; values: Fields }

export function CompanyForm({ id, values }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Fields>({ defaultValues: values })

  const gstin = watch('gstin')
  const gstApplicable = watch('gst_applicable')
  const derived = gstStateFor(gstin)

  const onSubmit = handleSubmit((fields) => {
    const parsed = companySchema.safeParse(fields)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') as keyof Fields
        if (key) setError(key, { message: issue.message })
      }
      toast.error('Check the highlighted fields.')
      return
    }

    startTransition(async () => {
      const result = await updateCompany(id, fields)
      if (result.ok) {
        toast.success('Client updated')
        router.push(`/companies/${id}`)
        router.refresh()
      } else {
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(path as keyof Fields, { message })
        }
        toast.error(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="type" required>
              <Select id="type" {...register('type')}>
                {optionsFrom(COMPANY_TYPE)}
              </Select>
            </Field>
            <Field label="City" htmlFor="city" error={errors.city?.message}>
              <Input id="city" {...register('city')} />
            </Field>
          </div>

          <Field
            label="Address"
            htmlFor="address"
            hint="Printed as the billing address on their documents"
            error={errors.address?.message}
          >
            <Textarea id="address" rows={2} {...register('address')} />
          </Field>

          <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" rows={3} {...register('notes')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax</CardTitle>
          <p className="text-sm text-muted-foreground">
            What decides whether this client gets a tax invoice or a bill of supply, and which
            state their place of supply is.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="GSTIN"
            htmlFor="gstin"
            hint="15 characters, as on their registration certificate"
            error={errors.gstin?.message}
          >
            <Input
              id="gstin"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="24AAAAA0000A1Z5"
              {...register('gstin', {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                  const next = event.target.value.toUpperCase()
                  setValue('gstin', next, { shouldValidate: false })
                  // Filling the state from the GSTIN rather than asking twice.
                  // The document flow takes the place-of-supply code from these
                  // two digits and its name from the state column, so leaving
                  // them to be typed independently invites a contradiction.
                  const state = gstStateFor(next)
                  if (state) setValue('state', state.name, { shouldValidate: false })
                },
              })}
            />
          </Field>

          <Field
            label="State"
            htmlFor="state"
            hint={
              derived
                ? `Place of supply ${derived.code} — filled from the GSTIN`
                : 'Their state, for place of supply'
            }
            error={errors.state?.message}
          >
            <Input id="state" {...register('state')} />
          </Field>

          <div className="space-y-3 rounded-md border bg-muted/40 p-3">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
                {...register('gst_applicable')}
              />
              <span>
                <span className="font-medium">GST applies to this client</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  On, they get a tax invoice. Off, a bill of supply — and the system refuses to
                  raise a tax invoice against them at all.
                </span>
              </span>
            </label>

            {!gstApplicable && (
              <Field
                label="Why GST does not apply"
                htmlFor="gst_exemption_reason"
                required
                hint="This is the reasoning an assessing officer asks for"
                error={errors.gst_exemption_reason?.message}
              >
                <Textarea
                  id="gst_exemption_reason"
                  rows={2}
                  placeholder="e.g. Exempt supply under Notification 12/2017 — educational institution"
                  {...register('gst_exemption_reason')}
                />
              </Field>
            )}
          </div>

          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Changing any of this leaves documents already issued exactly as they were printed.
            Each one keeps the client&apos;s details as they stood on the day it was issued.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save changes
        </Button>
      </div>
    </form>
  )
}
