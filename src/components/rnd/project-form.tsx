'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CURRENCY, RND_STAGE } from '@/lib/constants'
import { rndProjectSchema } from '@/lib/schemas/rnd'
import { createRndProject, updateRndProject } from '@/app/(app)/rnd/actions'

type Fields = {
  project_code: string
  project_name: string
  description: string
  approx_budget: string
  currency: keyof typeof CURRENCY
  start_date: string
  target_date: string
  actual_end_date: string
  stage: keyof typeof RND_STAGE
  lead_id: string
  notes: string
}

type Props = {
  mode: 'create' | 'edit'
  staff: { id: string; full_name: string }[]
  currentUserId: string
  initial?: { id: string; values: Partial<Fields> }
}

export function ProjectForm({ mode, staff, currentUserId, initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Fields>({
    defaultValues: {
      project_code: '',
      project_name: '',
      description: '',
      approx_budget: '',
      currency: 'INR',
      start_date: new Date().toISOString().slice(0, 10),
      target_date: '',
      actual_end_date: '',
      stage: 'concept',
      lead_id: currentUserId,
      notes: '',
      ...initial?.values,
    },
  })

  const onSubmit = handleSubmit((fields) => {
    const input = {
      project_code: fields.project_code || undefined,
      project_name: fields.project_name,
      description: fields.description || undefined,
      approx_budget: fields.approx_budget,
      currency: fields.currency,
      start_date: fields.start_date,
      target_date: fields.target_date,
      actual_end_date: fields.actual_end_date,
      stage: fields.stage,
      lead_id: fields.lead_id || undefined,
      notes: fields.notes || undefined,
    }

    // Same schema the server enforces, run here to save a round trip.
    const parsed = rndProjectSchema.safeParse(input)
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
          ? await updateRndProject(initial.id, input)
          : await createRndProject(input)

      if (result.ok) {
        toast.success(mode === 'edit' ? 'Project updated' : 'Project created')
        router.push(`/rnd/${result.id}`)
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
          <CardTitle className="text-base">Project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field
              label="Code"
              htmlFor="project_code"
              hint="e.g. RND-004"
              error={errors.project_code?.message}
            >
              <Input id="project_code" {...register('project_code')} />
            </Field>
            <Field
              label="Name"
              htmlFor="project_name"
              required
              error={errors.project_name?.message}
            >
              <Input id="project_name" {...register('project_name')} />
            </Field>
          </div>

          <Field label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea
              id="description"
              rows={3}
              placeholder="What is being developed, and why."
              {...register('description')}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Approx. budget"
              htmlFor="approx_budget"
              hint="An estimate, not a cap"
              error={errors.approx_budget?.message}
            >
              <Input
                id="approx_budget"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                {...register('approx_budget')}
              />
            </Field>
            <Field label="Currency" htmlFor="currency" hint="Budget and every expense line">
              <Select id="currency" {...register('currency')}>
                {optionsFrom(CURRENCY)}
              </Select>
            </Field>
            <Field label="Stage" htmlFor="stage">
              <Select id="stage" {...register('stage')}>
                {optionsFrom(RND_STAGE)}
              </Select>
            </Field>
            <Field label="Lead" htmlFor="lead_id">
              <Select id="lead_id" {...register('lead_id')}>
                <option value="">Unassigned</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Start date" htmlFor="start_date" error={errors.start_date?.message}>
              <Input id="start_date" type="date" {...register('start_date')} />
            </Field>
            <Field
              label="Target date"
              htmlFor="target_date"
              hint="Drives the timeline"
              error={errors.target_date?.message}
            >
              <Input id="target_date" type="date" {...register('target_date')} />
            </Field>
            <Field
              label="Actual end"
              htmlFor="actual_end_date"
              error={errors.actual_end_date?.message}
            >
              <Input id="actual_end_date" type="date" {...register('actual_end_date')} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" rows={2} {...register('notes')} />
          </Field>

          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Spend is not entered here. Record expenses on the project page and the total is summed
            for you.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {mode === 'edit' ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}
