'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { INQUIRY_STATUS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { setInquiryStatus } from '@/app/(app)/inquiries/actions'
import { ConvertToOrder } from '@/components/inquiries/convert-to-order'
import type { CurrencyCode, InquiryStatus } from '@/types/database'

type Props = {
  inquiryId: string
  status: InquiryStatus
  lostReason: string | null
  /** True once an order exists against this inquiry. */
  alreadyOrdered: boolean
  estimatedValue: number | null
  currency: CurrencyCode
}

const ORDER: InquiryStatus[] = [
  'new',
  'in_discussion',
  'quoted',
  'negotiation',
  'confirmed',
  'lost',
  'on_hold',
]

/**
 * Change status, with the current one beside it.
 *
 * Status is what moves on an inquiry, and moving it used to mean opening the
 * whole edit form and saving every other field back over itself. This writes
 * the one column.
 *
 * Confirmed is the exception. Confirming an inquiry is what creating its order
 * does, so picking it here opens the Convert to order form rather than setting
 * a status that claims an order exists when none does. Once there is an order,
 * Confirmed is just a status again and is set directly.
 */
export function ChangeStatus({
  inquiryId,
  status,
  lostReason,
  alreadyOrdered,
  estimatedValue,
  currency,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<InquiryStatus>(status)
  const [reason, setReason] = useState(lostReason ?? '')
  const [error, setError] = useState<string>()

  const needsConversion = choice === 'confirmed' && !alreadyOrdered

  function begin() {
    setChoice(status)
    setReason(lostReason ?? '')
    setError(undefined)
    setOpen(true)
  }

  function submit() {
    if (needsConversion) {
      setOpen(false)
      setConverting(true)
      return
    }

    setError(undefined)
    startTransition(async () => {
      const result = await setInquiryStatus(inquiryId, choice, reason)
      if (result.ok) {
        toast.success(`Status set to ${INQUIRY_STATUS[choice]}`)
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={begin}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Change status
        </Button>
        <StatusBadge status={status} />
      </div>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Change status"
        description="Where this inquiry has got to."
      >
        <div className="space-y-4">
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {/*
            A list rather than a <select>: every status is a tap on a phone,
            which is where this gets used, and the one in force is visible
            without opening anything.
          */}
          <ul className="space-y-1.5" role="radiogroup" aria-label="Status">
            {ORDER.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === key}
                  onClick={() => setChoice(key)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm hover:bg-accent',
                    choice === key ? 'border-primary bg-accent' : 'border-input'
                  )}
                >
                  <span className="flex items-center gap-2">
                    {INQUIRY_STATUS[key]}
                    {key === status && (
                      <span className="text-xs text-muted-foreground">· current</span>
                    )}
                  </span>
                  {choice === key && <Check className="h-4 w-4 text-primary" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>

          {choice === 'lost' && (
            <Field label="Why it was lost" htmlFor="lost_reason" required>
              <Textarea
                id="lost_reason"
                rows={2}
                value={reason}
                placeholder="Price, timing, competitor…"
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}

          {needsConversion && (
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Confirming means there is an order. Continuing opens the order form — the inquiry is
              marked Confirmed when that order is created.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending || (choice === status && !needsConversion)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {needsConversion ? 'Continue to order' : 'Save status'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConvertToOrder
        inquiryId={inquiryId}
        enabled
        hideTrigger
        controlledOpen={converting}
        onOpenChange={setConverting}
        estimatedValue={estimatedValue}
        currency={currency}
      />
    </>
  )
}
