'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  QUALIFICATION_STAGE,
  QUALIFICATION_STAGE_WHEN,
  QUALIFICATION_STATUS,
} from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { saveQualification, setRequiresQualification } from '@/app/(app)/quality/actions'
import type { QualificationStage, QualificationStatus } from '@/types/database'

type Stage = {
  stage: QualificationStage
  status?: QualificationStatus
  planned_date?: string | null
  performed_on?: string | null
  customer_representative?: string | null
  customer_signed_off?: boolean
  signed_off_on?: string | null
  summary?: string | null
  notes?: string | null
}

type Props = {
  orderId: string
  required: boolean
  stages: Stage[]
}

const VARIANT: Record<QualificationStatus, 'ok' | 'muted' | 'overdue' | 'duesoon'> = {
  not_started: 'muted',
  in_progress: 'duesoon',
  passed: 'ok',
  failed: 'overdue',
}

/**
 * DQ, IQ, OQ and PQ across the life of the order.
 *
 * Deliberately not tied to dispatch: DQ happens before manufacture, but IQ,
 * OQ and PQ all happen at the client's site after delivery. Gating dispatch
 * on them would make dispatch impossible.
 */
export function QualificationTracker({ orderId, required, stages }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<Stage>()
  const [form, setForm] = useState({
    status: 'not_started' as QualificationStatus,
    planned_date: '',
    performed_on: '',
    customer_representative: '',
    customer_signed_off: false,
    signed_off_on: '',
    summary: '',
    notes: '',
  })

  function open(stage: Stage) {
    setEditing(stage)
    setForm({
      status: stage.status ?? 'not_started',
      planned_date: stage.planned_date ?? '',
      performed_on: stage.performed_on ?? '',
      customer_representative: stage.customer_representative ?? '',
      customer_signed_off: stage.customer_signed_off ?? false,
      signed_off_on: stage.signed_off_on ?? '',
      summary: stage.summary ?? '',
      notes: stage.notes ?? '',
    })
  }

  function submit() {
    if (!editing) return
    startTransition(async () => {
      const result = await saveQualification({ ...form, order_id: orderId, stage: editing.stage })
      if (result.ok) {
        toast.success(`${editing.stage.toUpperCase()} updated`)
        setEditing(undefined)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function toggleRequired() {
    startTransition(async () => {
      const result = await setRequiresQualification(orderId, !required)
      if (result.ok) router.refresh()
      else toast.error(result.error)
    })
  }

  if (!required) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-muted-foreground">
            This order has no qualification requirement. Turn it on if the client needs DQ, IQ, OQ
            and PQ handover records.
          </p>
          <Button size="sm" variant="outline" onClick={toggleRequired} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Needs qualification
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          Qualification &amp; handover
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={toggleRequired} disabled={pending}>
          Not required
        </Button>
      </CardHeader>

      <CardContent className="space-y-2">
        {stages.map((stage) => (
          <button
            key={stage.stage}
            type="button"
            onClick={() => open(stage)}
            className="flex w-full flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-left hover:bg-accent/50"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium uppercase">{stage.stage}</span>
                <span className="text-sm">{QUALIFICATION_STAGE[stage.stage]}</span>
                <Badge variant={VARIANT[stage.status ?? 'not_started']}>
                  {QUALIFICATION_STATUS[stage.status ?? 'not_started']}
                </Badge>
                {stage.customer_signed_off && <Badge variant="ok">Client signed</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {QUALIFICATION_STAGE_WHEN[stage.stage]}
              </p>
              {stage.summary && <p className="mt-1 text-sm">{stage.summary}</p>}
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              {stage.performed_on
                ? `Done ${formatDate(stage.performed_on)}`
                : stage.planned_date
                  ? `Planned ${formatDate(stage.planned_date)}`
                  : '—'}
            </div>
          </button>
        ))}

        <p className="text-xs text-muted-foreground">
          DQ happens before manufacture. IQ, OQ and PQ happen at the client&apos;s site after
          delivery, so none of them hold up dispatch — only the QA check does.
        </p>
      </CardContent>

      <Modal
        open={Boolean(editing)}
        onClose={() => !pending && setEditing(undefined)}
        title={editing ? `${editing.stage.toUpperCase()} — ${QUALIFICATION_STAGE[editing.stage]}` : ''}
        description={editing ? QUALIFICATION_STAGE_WHEN[editing.stage] : undefined}
      >
        <div className="space-y-4">
          <Field label="Status" htmlFor="q_status" required>
            <Select
              id="q_status"
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as QualificationStatus })
              }
            >
              {optionsFrom(QUALIFICATION_STATUS)}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Planned date" htmlFor="q_planned">
              <Input
                id="q_planned"
                type="date"
                value={form.planned_date}
                onChange={(e) => setForm({ ...form, planned_date: e.target.value })}
              />
            </Field>
            <Field label="Performed on" htmlFor="q_performed">
              <Input
                id="q_performed"
                type="date"
                value={form.performed_on}
                onChange={(e) => setForm({ ...form, performed_on: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Summary" htmlFor="q_summary">
            <Textarea
              id="q_summary"
              rows={3}
              value={form.summary}
              placeholder="Machine installed on the prepared foundation, levelled and connected to 3-phase supply. Earthing verified."
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </Field>

          <Field label="Client representative" htmlFor="q_rep">
            <Input
              id="q_rep"
              value={form.customer_representative}
              onChange={(e) => setForm({ ...form, customer_representative: e.target.value })}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.customer_signed_off}
              onChange={(e) => setForm({ ...form, customer_signed_off: e.target.checked })}
            />
            Client has signed this stage off
          </label>

          {form.customer_signed_off && (
            <Field label="Signed on" htmlFor="q_signed" required>
              <Input
                id="q_signed"
                type="date"
                value={form.signed_off_on}
                onChange={(e) => setForm({ ...form, signed_off_on: e.target.value })}
              />
            </Field>
          )}

          <Field label="Notes" htmlFor="q_notes">
            <Textarea
              id="q_notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditing(undefined)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
