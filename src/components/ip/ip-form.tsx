'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CONFIDENTIALITY, IP_ROUTE, IP_STATUS, IP_TYPE } from '@/lib/constants'
import { ipAssetSchema } from '@/lib/schemas/ip'
import { createIpAsset, updateIpAsset } from '@/app/(app)/ip/actions'

type Fields = {
  title: string
  ip_type: keyof typeof IP_TYPE
  status: keyof typeof IP_STATUS
  protection_route: string
  jurisdiction: string
  application_no: string
  registration_no: string
  rnd_project_id: string
  filing_date: string
  publication_date: string
  grant_date: string
  expiry_date: string
  next_renewal_date: string
  inventors: string
  owner_entity: string
  attorney_firm: string
  attorney_contact: string
  confidentiality: keyof typeof CONFIDENTIALITY
  notes: string
}

type Props = {
  mode: 'create' | 'edit'
  projects: { id: string; project_name: string; project_code: string | null }[]
  initial?: { id: string; values: Partial<Fields> }
}

export function IpForm({ mode, projects, initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Fields>({
    defaultValues: {
      title: '',
      ip_type: 'patent',
      status: 'idea',
      protection_route: '',
      jurisdiction: 'India',
      application_no: '',
      registration_no: '',
      rnd_project_id: '',
      filing_date: '',
      publication_date: '',
      grant_date: '',
      expiry_date: '',
      next_renewal_date: '',
      inventors: '',
      owner_entity: 'ANK Design & Automation Solutions LLP',
      attorney_firm: '',
      attorney_contact: '',
      confidentiality: 'internal',
      notes: '',
      ...initial?.values,
    },
  })

  const onSubmit = handleSubmit((fields) => {
    const parsed = ipAssetSchema.safeParse(fields)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') as keyof Fields
        if (key) setError(key, { message: issue.message })
      }
      toast.error('Check the highlighted fields.')
      return
    }

    startTransition(async () => {
      const result =
        mode === 'edit' && initial
          ? await updateIpAsset(initial.id, fields)
          : await createIpAsset(fields)

      if (result.ok) {
        toast.success(mode === 'edit' ? 'Asset updated' : 'IP asset created')
        router.push(`/ip/${result.id}`)
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
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Title" htmlFor="title" required error={errors.title?.message}>
            <Input
              id="title"
              placeholder="Vibration damper with tuned mass assembly"
              {...register('title')}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type" htmlFor="ip_type" required>
              <Select id="ip_type" {...register('ip_type')}>
                {optionsFrom(IP_TYPE)}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" {...register('status')}>
                {optionsFrom(IP_STATUS)}
              </Select>
            </Field>
            <Field label="Route" htmlFor="protection_route">
              <Select id="protection_route" {...register('protection_route')}>
                <option value="">Not set</option>
                {optionsFrom(IP_ROUTE)}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Jurisdiction"
              htmlFor="jurisdiction"
              required
              error={errors.jurisdiction?.message}
            >
              <Input id="jurisdiction" {...register('jurisdiction')} />
            </Field>
            <Field label="Application no." htmlFor="application_no">
              <Input id="application_no" {...register('application_no')} />
            </Field>
            <Field label="Registration no." htmlFor="registration_no">
              <Input id="registration_no" {...register('registration_no')} />
            </Field>
          </div>

          <Field
            label="From R&D project"
            htmlFor="rnd_project_id"
            hint="Links the asset to the work that produced it"
          >
            <Select id="rnd_project_id" {...register('rnd_project_id')}>
              <option value="">Not linked</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_code ? `${p.project_code} · ` : ''}
                  {p.project_name}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dates</CardTitle>
          <p className="text-sm text-muted-foreground">
            The renewal date is the one that matters — it drives the dashboard alarms.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Filed" htmlFor="filing_date" error={errors.filing_date?.message}>
            <Input id="filing_date" type="date" {...register('filing_date')} />
          </Field>
          <Field label="Published" htmlFor="publication_date">
            <Input id="publication_date" type="date" {...register('publication_date')} />
          </Field>
          <Field label="Granted" htmlFor="grant_date" error={errors.grant_date?.message}>
            <Input id="grant_date" type="date" {...register('grant_date')} />
          </Field>
          <Field label="Expires" htmlFor="expiry_date" error={errors.expiry_date?.message}>
            <Input id="expiry_date" type="date" {...register('expiry_date')} />
          </Field>
          <Field
            label="Next renewal"
            htmlFor="next_renewal_date"
            className="sm:col-span-2"
            hint="Surfaces at 90, 30 and 7 days on the dashboard"
          >
            <Input id="next_renewal_date" type="date" {...register('next_renewal_date')} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ownership</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="Inventors"
            htmlFor="inventors"
            hint="Separate names with commas"
            error={errors.inventors?.message}
          >
            <Input id="inventors" placeholder="A Sharma, B Patel" {...register('inventors')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Owner entity" htmlFor="owner_entity">
              <Input id="owner_entity" {...register('owner_entity')} />
            </Field>
            <Field label="Confidentiality" htmlFor="confidentiality">
              <Select id="confidentiality" {...register('confidentiality')}>
                {optionsFrom(CONFIDENTIALITY)}
              </Select>
            </Field>
          </div>

          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Marking an asset <strong className="font-medium">Restricted</strong> hides it from
            everyone except admins and the lead of its linked R&amp;D project. This is enforced by
            the database, not just the screen.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Attorney firm" htmlFor="attorney_firm">
              <Input id="attorney_firm" {...register('attorney_firm')} />
            </Field>
            <Field label="Attorney contact" htmlFor="attorney_contact">
              <Input id="attorney_contact" {...register('attorney_contact')} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" rows={3} {...register('notes')} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {mode === 'edit' ? 'Save changes' : 'Create asset'}
        </Button>
      </div>
    </form>
  )
}
