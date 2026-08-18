'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FilePlus2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DOCUMENT_TYPE, GST_STATES, TAXABLE_DOCUMENT_TYPES } from '@/lib/constants'
import { createDocument } from '@/app/(app)/documents/actions'
import type { DocumentType, InvoiceRow } from '@/types/database'

type Props = {
  orderId: string
  /** Whether this client is charged GST — decides which types are offered. */
  gstApplicable: boolean
  /** Issued tax invoices, which a credit or debit note must reference. */
  parents: InvoiceRow[]
  /** The client's own state, used as the default place of supply. */
  defaultStateCode: string | null
}

/**
 * Raises a draft document from this order.
 *
 * The type list is filtered by the client's GST status rather than left open
 * and rejected later: a tax invoice for a client outside GST is not a mistake
 * worth letting someone make and then explaining.
 */
export function RaiseDocument({ orderId, gstApplicable, parents, defaultStateCode }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [docType, setDocType] = useState<DocumentType>(gstApplicable ? 'proforma' : 'proforma')
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [stateCode, setStateCode] = useState(defaultStateCode ?? '')
  const [parentId, setParentId] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDays, setDueDays] = useState('15')

  const available = (Object.keys(DOCUMENT_TYPE) as DocumentType[]).filter((type) => {
    if (TAXABLE_DOCUMENT_TYPES.includes(type)) return gstApplicable
    if (type === 'bill_of_supply') return !gstApplicable
    return true
  })

  const needsParent = docType === 'credit_note' || docType === 'debit_note'
  const isTax = TAXABLE_DOCUMENT_TYPES.includes(docType)

  function submit() {
    setError(undefined)
    startTransition(async () => {
      const result = await createDocument({
        order_id: orderId,
        doc_type: docType,
        doc_date: docDate,
        place_of_supply_code: stateCode,
        parent_invoice_id: parentId,
        notes,
        payment_due_days: dueDays,
      })
      if (result.ok && result.id) {
        toast.success('Draft created')
        setOpen(false)
        router.push(`/documents/${result.id}`)
      } else if (!result.ok) {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FilePlus2 className="h-4 w-4" aria-hidden />
        Raise document
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Raise a document"
        description="A draft is created from this order's line items. Nothing is numbered until you issue it."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Field label="Document type" htmlFor="doc_type" required>
            <Select
              id="doc_type"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
            >
              {available.map((type) => (
                <option key={type} value={type}>
                  {DOCUMENT_TYPE[type]}
                </option>
              ))}
            </Select>
          </Field>

          {!gstApplicable && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              This client is marked as not GST-applicable, so a bill of supply is offered instead
              of a tax invoice. That flag is on the client record.
            </p>
          )}

          <Field label="Document date" htmlFor="doc_date" required>
            <Input
              id="doc_date"
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
            />
          </Field>

          {/* A challan moves goods rather than charging for them, so it prints
              no terms and there is nothing to set. */}
          {docType !== 'delivery_challan' && (
            <Field
              label="Payment terms"
              htmlFor="due_days"
              hint="Days from the document date. 0 prints “Due on receipt”."
            >
              <Input
                id="due_days"
                type="number"
                min={0}
                max={365}
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
              />
            </Field>
          )}

          {isTax && (
            <Field
              label="Place of supply"
              htmlFor="pos"
              required
              hint="Same state as ANK gives CGST + SGST; any other state gives IGST"
            >
              <Select id="pos" value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
                <option value="">Select a state</option>
                {Object.entries(GST_STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} — {name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {needsParent && (
            <Field
              label="Against which invoice"
              htmlFor="parent"
              required
              hint="A credit or debit note must reference the invoice it corrects"
            >
              <Select id="parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Select an invoice</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.doc_no} — {p.doc_date}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {needsParent && parents.length === 0 && (
            <p className="text-sm text-overdue">
              No tax invoice has been issued against this order yet, so there is nothing to correct.
            </p>
          )}

          <Field label="Notes" htmlFor="doc_notes" hint="Printed on the document">
            <Textarea
              id="doc_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending || (needsParent && !parentId) || (isTax && !stateCode)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Create draft
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
