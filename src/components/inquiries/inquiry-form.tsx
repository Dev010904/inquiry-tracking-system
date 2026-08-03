'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { AlertCircle, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FOLLOWUP_CHANNEL, INQUIRY_STATUS, PRIORITY } from '@/lib/constants'
import { inquirySchema, type InquiryInput } from '@/lib/schemas/inquiry'
import { CompanyPicker, type CompanyOption, type NewCompanyDraft } from './company-picker'
import {
  createInquiry,
  fetchCompanyContacts,
  updateInquiry,
  type SaveResult,
} from '@/app/(app)/inquiries/actions'

type ContactOption = {
  id: string
  name: string
  phone: string | null
  email: string | null
  designation: string | null
  is_primary: boolean
}

type NewContactDraft = { name: string; phone: string; email: string; designation: string }

const EMPTY_CONTACT: NewContactDraft = { name: '', phone: '', email: '', designation: '' }

type ScalarFields = {
  inquiry_date: string
  source: string
  requirement_summary: string
  estimated_value: string
  status: keyof typeof INQUIRY_STATUS
  priority: keyof typeof PRIORITY
  owner_id: string
  lost_reason: string
  followup_due: string
  followup_channel: keyof typeof FOLLOWUP_CHANNEL
  followup_note: string
}

export type InquiryFormProps = {
  mode: 'create' | 'edit'
  companies: CompanyOption[]
  staff: { id: string; full_name: string }[]
  currentUserId: string
  initial?: {
    id: string
    values: Partial<ScalarFields>
    companyId: string
    contactId: string | null
    contacts: ContactOption[]
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Default first follow-up: three days out at 10am, a sane working default. */
function defaultFollowupDue(): string {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  date.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function InquiryForm({ mode, companies, staff, currentUserId, initial }: InquiryFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<ScalarFields>({
    defaultValues: {
      inquiry_date: today(),
      source: '',
      requirement_summary: '',
      estimated_value: '',
      status: 'new',
      priority: 'medium',
      owner_id: currentUserId,
      lost_reason: '',
      followup_due: mode === 'create' ? defaultFollowupDue() : '',
      followup_channel: 'call',
      followup_note: '',
      ...initial?.values,
    },
  })

  const [companyId, setCompanyId] = useState<string | undefined>(initial?.companyId)
  const [companyDraft, setCompanyDraft] = useState<NewCompanyDraft | null>(null)
  const [contacts, setContacts] = useState<ContactOption[]>(initial?.contacts ?? [])
  const [contactId, setContactId] = useState<string>(initial?.contactId ?? '')
  const [contactDraft, setContactDraft] = useState<NewContactDraft | null>(null)
  const [formError, setFormError] = useState<string>()
  const [companyError, setCompanyError] = useState<string>()
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({})

  const status = watch('status')

  // Contacts belong to the chosen company, so the list is reloaded whenever
  // that changes — and any previously chosen contact is cleared, because it
  // belongs to the old company.
  useEffect(() => {
    if (!companyId) {
      setContacts([])
      setContactId('')
      return
    }
    if (initial && companyId === initial.companyId) return
    let cancelled = false
    fetchCompanyContacts(companyId).then((rows) => {
      if (cancelled) return
      setContacts(rows)
      setContactId(rows.find((c) => c.is_primary)?.id ?? '')
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  function buildInput(fields: ScalarFields): InquiryInput {
    return {
      inquiry_date: fields.inquiry_date,
      company_id: companyDraft ? undefined : companyId,
      new_company: companyDraft
        ? {
            name: companyDraft.name,
            type: companyDraft.type,
            city: companyDraft.city || undefined,
            state: companyDraft.state || undefined,
          }
        : undefined,
      contact_id: contactDraft ? undefined : contactId || undefined,
      new_contact: contactDraft
        ? {
            name: contactDraft.name,
            phone: contactDraft.phone || undefined,
            email: contactDraft.email || undefined,
            designation: contactDraft.designation || undefined,
          }
        : undefined,
      source: fields.source || undefined,
      requirement_summary: fields.requirement_summary,
      estimated_value: fields.estimated_value,
      status: fields.status,
      priority: fields.priority,
      owner_id: fields.owner_id || undefined,
      lost_reason: fields.lost_reason || undefined,
      followup_due: fields.followup_due || undefined,
      followup_channel: fields.followup_channel,
      followup_note: fields.followup_note || undefined,
    }
  }

  /** Server errors are keyed by zod path; route each one to its control. */
  function applyServerErrors(result: Extract<SaveResult, { ok: false }>) {
    setFormError(result.error)
    for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
      if (path.startsWith('new_company') || path === 'company_id') setCompanyError(message)
      else if (path.startsWith('new_contact') || path === 'contact_id') {
        setContactErrors((prev) => ({ ...prev, [path.split('.')[1] ?? 'name']: message }))
      } else setError(path as keyof ScalarFields, { message })
    }
  }

  const onSubmit = handleSubmit((fields) => {
    setFormError(undefined)
    setCompanyError(undefined)
    setContactErrors({})

    const input = buildInput(fields)

    // Validate with the same schema the server uses, so the user sees the
    // problem before a round trip. The server re-runs it regardless.
    const parsed = inquirySchema.safeParse(input)
    if (!parsed.success) {
      applyServerErrors({
        ok: false,
        error: 'Check the highlighted fields.',
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message])
        ),
      })
      return
    }

    startTransition(async () => {
      const result =
        mode === 'edit' && initial
          ? await updateInquiry(initial.id, input)
          : await createInquiry(input)

      if (result.ok) {
        toast.success(mode === 'edit' ? 'Inquiry updated' : 'Inquiry logged')
        router.push(`/inquiries/${result.id}`)
        router.refresh()
      } else {
        applyServerErrors(result)
        toast.error(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-4">
      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {formError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Company / school" htmlFor="company" required>
            <CompanyPicker
              companies={companies}
              selectedId={companyId}
              onSelect={setCompanyId}
              draft={companyDraft}
              onDraftChange={setCompanyDraft}
              allowCreate={mode === 'create'}
              error={companyError}
            />
          </Field>

          {contactDraft ? (
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">New contact</p>
                <Button variant="ghost" size="sm" onClick={() => setContactDraft(null)}>
                  Pick existing instead
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="contact-name" required error={contactErrors.name}>
                  <Input
                    id="contact-name"
                    value={contactDraft.name}
                    autoFocus
                    onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })}
                  />
                </Field>
                <Field
                  label="Designation"
                  htmlFor="contact-designation"
                  error={contactErrors.designation}
                >
                  <Input
                    id="contact-designation"
                    value={contactDraft.designation}
                    placeholder="e.g. Principal, Purchase Head"
                    onChange={(e) =>
                      setContactDraft({ ...contactDraft, designation: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Phone"
                  htmlFor="contact-phone"
                  error={contactErrors.phone}
                  hint="Phone or email — at least one"
                >
                  <Input
                    id="contact-phone"
                    type="tel"
                    inputMode="tel"
                    value={contactDraft.phone}
                    onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
                  />
                </Field>
                <Field label="Email" htmlFor="contact-email" error={contactErrors.email}>
                  <Input
                    id="contact-email"
                    type="email"
                    value={contactDraft.email}
                    onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <Field label="Contact person" htmlFor="contact" error={contactErrors.contact_id}>
              <div className="flex gap-2">
                <Select
                  id="contact"
                  value={contactId}
                  disabled={!companyId && !companyDraft}
                  onChange={(e) => setContactId(e.target.value)}
                >
                  <option value="">
                    {companyId || companyDraft ? 'No contact selected' : 'Pick a company first'}
                  </option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                      {contact.designation ? ` · ${contact.designation}` : ''}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  onClick={() => {
                    setContactId('')
                    setContactDraft(EMPTY_CONTACT)
                  }}
                  className="shrink-0"
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">New</span>
                </Button>
              </div>
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inquiry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Inquiry date"
              htmlFor="inquiry_date"
              required
              error={errors.inquiry_date?.message}
            >
              <Input id="inquiry_date" type="date" {...register('inquiry_date')} />
            </Field>
            <Field label="Source" htmlFor="source" hint="Referral, website, exhibition…">
              <Input id="source" {...register('source')} />
            </Field>
          </div>

          <Field
            label="What they asked for"
            htmlFor="requirement_summary"
            required
            error={errors.requirement_summary?.message}
          >
            <Textarea
              id="requirement_summary"
              rows={4}
              placeholder="Requirement in their words — quantities, specs, timelines."
              {...register('requirement_summary')}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Estimated value"
              htmlFor="estimated_value"
              hint="Excluding GST"
              error={errors.estimated_value?.message}
            >
              <Input
                id="estimated_value"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0"
                {...register('estimated_value')}
              />
            </Field>
            <Field label="Priority" htmlFor="priority">
              <Select id="priority" {...register('priority')}>
                {optionsFrom(PRIORITY)}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" {...register('status')}>
                {optionsFrom(INQUIRY_STATUS)}
              </Select>
            </Field>
          </div>

          {status === 'lost' && (
            <Field
              label="Why was it lost?"
              htmlFor="lost_reason"
              required
              error={errors.lost_reason?.message}
            >
              <Textarea id="lost_reason" rows={2} {...register('lost_reason')} />
            </Field>
          )}

          <Field label="Owner" htmlFor="owner_id" hint="Who chases this">
            <Select id="owner_id" {...register('owner_id')}>
              <option value="">Unassigned</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      {mode === 'create' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">First follow-up</CardTitle>
            <p className="text-sm text-muted-foreground">
              This is what puts the inquiry on the dashboard alarm panel. Clear the date only if
              you truly do not intend to chase it.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label="Due" htmlFor="followup_due">
              <Input id="followup_due" type="datetime-local" {...register('followup_due')} />
            </Field>
            <Field label="Channel" htmlFor="followup_channel">
              <Select id="followup_channel" {...register('followup_channel')}>
                {optionsFrom(FOLLOWUP_CHANNEL)}
              </Select>
            </Field>
            <Field label="Note" htmlFor="followup_note">
              <Input
                id="followup_note"
                placeholder="Call about the quotation"
                {...register('followup_note')}
              />
            </Field>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {mode === 'edit' ? 'Save changes' : 'Log inquiry'}
        </Button>
      </div>
    </form>
  )
}
