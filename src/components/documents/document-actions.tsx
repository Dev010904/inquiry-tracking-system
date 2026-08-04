'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2, Printer, Stamp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { INVOICE_COPIES, type InvoiceCopy } from '@/lib/constants'
import { cancelDocument, issueDocument } from '@/app/(app)/documents/actions'
import type { DocumentStatus } from '@/types/database'

type Props = {
  invoiceId: string
  status: DocumentStatus
  isAdmin: boolean
  copies: InvoiceCopy[]
  onCopiesChange: (copies: InvoiceCopy[]) => void
}

/**
 * Issue, cancel and print.
 *
 * Issuing is deliberately a confirmed, one-way action: it allocates a number
 * from a gapless series and freezes the document. Nothing about it can be
 * undone, so the dialogue says so plainly rather than relying on the user
 * knowing.
 */
export function DocumentActions({
  invoiceId,
  status,
  isAdmin,
  copies,
  onCopiesChange,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmIssue, setConfirmIssue] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()

  function issue() {
    setError(undefined)
    startTransition(async () => {
      const result = await issueDocument(invoiceId)
      if (result.ok) {
        toast.success(`Issued as ${result.docNo}`)
        setConfirmIssue(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function cancel() {
    setError(undefined)
    startTransition(async () => {
      const result = await cancelDocument(invoiceId, reason)
      if (result.ok) {
        toast.success('Document cancelled')
        setConfirmCancel(false)
        setReason('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function toggleCopy(copy: InvoiceCopy) {
    onCopiesChange(
      copies.includes(copy) ? copies.filter((c) => c !== copy) : [...copies, copy]
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {status === 'draft' && (
        <Button size="sm" onClick={() => setConfirmIssue(true)}>
          <Stamp className="h-4 w-4" aria-hidden />
          Issue
        </Button>
      )}

      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden />
        Print / Save as PDF
      </Button>

      {status !== 'cancelled' && isAdmin && (
        <Button size="sm" variant="outline" onClick={() => setConfirmCancel(true)}>
          <Ban className="h-4 w-4" aria-hidden />
          Cancel document
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Copies:</span>
        {(Object.keys(INVOICE_COPIES) as InvoiceCopy[]).map((copy) => (
          <label key={copy} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={copies.includes(copy)}
              onChange={() => toggleCopy(copy)}
            />
            <span className="capitalize">{copy}</span>
          </label>
        ))}
      </div>

      <Modal
        open={confirmIssue}
        onClose={() => !pending && setConfirmIssue(false)}
        title="Issue this document?"
        description="A number is allocated from the series and the supplier and buyer details are frozen onto it. This cannot be undone or edited afterwards — corrections go through a credit or debit note."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmIssue(false)} disabled={pending}>
              Not yet
            </Button>
            <Button onClick={issue} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Issue it
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmCancel}
        onClose={() => !pending && setConfirmCancel(false)}
        title="Cancel this document"
        description="The number is not reused — a cancelled document stays in the series with its reason, which is what an auditor expects to see."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Field label="Reason" htmlFor="cancel_reason" required>
            <Textarea
              id="cancel_reason"
              rows={3}
              value={reason}
              placeholder="Raised against the wrong order."
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={pending}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={cancel}
              disabled={pending || reason.trim().length < 3}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Cancel document
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
