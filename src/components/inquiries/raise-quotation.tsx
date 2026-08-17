'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { GST_STATES } from '@/lib/constants'
import { createQuotation } from '@/app/(app)/documents/actions'

type Props = {
  inquiryId: string
  /** The client's own state, used as the default place of supply. */
  defaultStateCode: string | null
}

/**
 * Raises a quotation against this inquiry.
 *
 * Available at any status, unlike Convert to order: a quotation is what goes
 * out *before* anything is agreed, so gating it on the inquiry being nearly
 * won would make it useless.
 *
 * The draft is created empty and opens straight into its own page, where the
 * lines are typed. Place of supply is asked for because it decides CGST+SGST
 * against IGST, and a quotation showing the wrong split misquotes the price.
 */
export function RaiseQuotation({ inquiryId, defaultStateCode }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [stateCode, setStateCode] = useState(defaultStateCode ?? '')
  const [notes, setNotes] = useState('')

  function submit() {
    setError(undefined)
    startTransition(async () => {
      const result = await createQuotation({
        inquiry_id: inquiryId,
        doc_date: docDate,
        place_of_supply_code: stateCode,
        notes,
      })
      if (result.ok) {
        toast.success('Quotation drafted')
        setOpen(false)
        router.push(`/documents/${result.id}`)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" aria-hidden />
        Quotation
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Raise a quotation"
        description="Creates a draft. You add the lines on the next screen."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="q_date" required>
              <Input
                id="q_date"
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
              />
            </Field>

            <Field
              label="Place of supply"
              htmlFor="q_state"
              hint="Decides CGST + SGST against IGST"
            >
              <Select
                id="q_state"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
              >
                <option value="">Not set</option>
                {Object.entries(GST_STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} — {name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Notes" htmlFor="q_notes" hint="Printed on the quotation">
            <Textarea
              id="q_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Create draft
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
