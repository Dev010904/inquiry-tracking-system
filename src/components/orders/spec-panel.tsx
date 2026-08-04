'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { updateOrderSpec } from '@/app/(app)/orders/actions'

type Props = {
  orderId: string
  technicalSpecification: string | null
  addendum: string | null
}

/**
 * The agreed specification, and anything changed since.
 *
 * Every edit here demands a reason, which is written into the audit trail
 * alongside the change. These are the two fields most likely to be disputed
 * later, so "who changed this, when, and why" has to be answerable.
 */
export function SpecPanel({ orderId, technicalSpecification, addendum }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [spec, setSpec] = useState(technicalSpecification ?? '')
  const [add, setAdd] = useState(addendum ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()

  function submit() {
    setError(undefined)
    startTransition(async () => {
      const result = await updateOrderSpec({
        order_id: orderId,
        technical_specification: spec,
        addendum: add,
        reason,
      })
      if (result.ok) {
        toast.success('Specification updated')
        setOpen(false)
        setReason('')
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          Technical specification
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {technicalSpecification ? (
          <p className="whitespace-pre-wrap text-sm">{technicalSpecification}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No specification recorded. This order predates the field — add it so production has
            something definite to build to.
          </p>
        )}

        {addendum && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Addendum / changes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{addendum}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Every change to these fields is recorded with a reason, in Recent changes.
        </p>
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Edit the specification"
        description="A reason is required — it is stored with the change."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Field label="Technical specification" htmlFor="spec" required>
            <Textarea id="spec" rows={6} value={spec} onChange={(e) => setSpec(e.target.value)} />
          </Field>

          <Field label="Addendum / changes" htmlFor="addendum_edit">
            <Textarea
              id="addendum_edit"
              rows={3}
              value={add}
              onChange={(e) => setAdd(e.target.value)}
            />
          </Field>

          <Field
            label="Reason for this change"
            htmlFor="reason"
            required
            hint="Shown to everyone in Recent changes"
          >
            <Textarea
              id="reason"
              rows={2}
              value={reason}
              placeholder="Client approved revised bore diameter on 04 Aug call."
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending || reason.trim().length < 3 || spec.trim().length < 20}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save changes
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
