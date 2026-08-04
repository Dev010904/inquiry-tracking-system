'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MEETING_TYPE } from '@/lib/constants'
import { saveMeeting } from '@/app/(app)/quality/actions'
import type { MeetingRow, MeetingType } from '@/types/database'

type Props = {
  meeting?: MeetingRow
  companies: { id: string; name: string }[]
  /** Pre-selected when opened from an order or company screen. */
  defaults?: { company_id?: string; order_id?: string; inquiry_id?: string }
}

/**
 * Minutes of a meeting.
 *
 * Split into agenda, discussion, decisions and next steps rather than one
 * free-text box, because those are the four things anyone actually looks for
 * afterwards — and separating them makes the decisions findable.
 */
export function MeetingForm({ meeting, companies, defaults }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    meeting_date: meeting?.meeting_date ?? new Date().toISOString().slice(0, 10),
    meeting_type: (meeting?.meeting_type ?? 'site_visit') as MeetingType,
    subject: meeting?.subject ?? '',
    location: meeting?.location ?? '',
    company_id: meeting?.company_id ?? defaults?.company_id ?? '',
    inquiry_id: meeting?.inquiry_id ?? defaults?.inquiry_id ?? '',
    order_id: meeting?.order_id ?? defaults?.order_id ?? '',
    internal_attendees: (meeting?.internal_attendees ?? []).join('\n'),
    client_attendees: (meeting?.client_attendees ?? []).join('\n'),
    agenda: meeting?.agenda ?? '',
    discussion: meeting?.discussion ?? '',
    decisions: meeting?.decisions ?? '',
    next_steps: meeting?.next_steps ?? '',
  })

  function submit() {
    setErrors({})
    startTransition(async () => {
      const result = await saveMeeting({ ...form, id: meeting?.id })
      if (result.ok && result.id) {
        toast.success('Minutes saved')
        router.push(`/meetings/${result.id}`)
      } else if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="m_date" required error={errors.meeting_date}>
          <Input
            id="m_date"
            type="date"
            value={form.meeting_date}
            onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
          />
        </Field>

        <Field label="Type" htmlFor="m_type" required>
          <Select
            id="m_type"
            value={form.meeting_type}
            onChange={(e) => setForm({ ...form, meeting_type: e.target.value as MeetingType })}
          >
            {optionsFrom(MEETING_TYPE)}
          </Select>
        </Field>

        <Field label="Location" htmlFor="m_location" error={errors.location}>
          <Input
            id="m_location"
            value={form.location}
            placeholder="Client factory, Vatva"
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Subject" htmlFor="m_subject" required error={errors.subject}>
        <Input
          id="m_subject"
          value={form.subject}
          placeholder="Site visit for conveyor layout"
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
      </Field>

      <Field
        label="Client"
        htmlFor="m_company"
        hint="Linking to a client makes these minutes show on their record"
      >
        <Select
          id="m_company"
          value={form.company_id}
          onChange={(e) => setForm({ ...form, company_id: e.target.value })}
        >
          <option value="">Not linked</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="ANK attendees"
          htmlFor="m_internal"
          hint="One name per line"
          error={errors.internal_attendees}
        >
          <Textarea
            id="m_internal"
            rows={3}
            value={form.internal_attendees}
            onChange={(e) => setForm({ ...form, internal_attendees: e.target.value })}
          />
        </Field>

        <Field
          label="Client attendees"
          htmlFor="m_client"
          hint="One name per line"
          error={errors.client_attendees}
        >
          <Textarea
            id="m_client"
            rows={3}
            value={form.client_attendees}
            onChange={(e) => setForm({ ...form, client_attendees: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Agenda" htmlFor="m_agenda" error={errors.agenda}>
        <Textarea
          id="m_agenda"
          rows={2}
          value={form.agenda}
          onChange={(e) => setForm({ ...form, agenda: e.target.value })}
        />
      </Field>

      <Field label="Discussion" htmlFor="m_discussion" error={errors.discussion}>
        <Textarea
          id="m_discussion"
          rows={6}
          value={form.discussion}
          onChange={(e) => setForm({ ...form, discussion: e.target.value })}
        />
      </Field>

      <Field
        label="Decisions"
        htmlFor="m_decisions"
        error={errors.decisions}
        hint="What was actually agreed — the part people come back to look for"
      >
        <Textarea
          id="m_decisions"
          rows={3}
          value={form.decisions}
          onChange={(e) => setForm({ ...form, decisions: e.target.value })}
        />
      </Field>

      <Field label="Next steps" htmlFor="m_next" error={errors.next_steps}>
        <Textarea
          id="m_next"
          rows={2}
          value={form.next_steps}
          onChange={(e) => setForm({ ...form, next_steps: e.target.value })}
        />
      </Field>

      <p className="text-sm text-muted-foreground">
        Action items are added after saving. An action with an owner and a due date becomes a
        follow-up, so it turns up on the dashboard alarm panel rather than only here.
      </p>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save minutes
        </Button>
      </div>
    </div>
  )
}
