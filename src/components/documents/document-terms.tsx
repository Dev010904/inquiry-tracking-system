'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { addInstallationOption, setDocumentTerms } from '@/app/(app)/documents/actions'
import { validTill } from '@/lib/format'
import type { InstallationOptionRow, InvoiceRow } from '@/types/database'

type Props = {
  invoice: InvoiceRow
  options: InstallationOptionRow[]
}

/**
 * The terms block on a draft, edited where the document is being written.
 *
 * Every field here used to be decided somewhere else. Validity was a number
 * buried in the raise dialogue and never seen again; payment terms and the
 * delivery timeline came from company settings and so were identical on every
 * document the firm had ever sent; the site installation line was an English
 * sentence in the print layout with the rate typed into it. All four are
 * negotiated per deal, which makes the draft screen the only honest place for
 * them.
 *
 * Saved as one block rather than field by field. They are read together on the
 * sheet, so a half-saved set — the new rate against the old visit count — is
 * a state worth making impossible rather than merely unlikely.
 *
 * The panel is only rendered for a draft. The database refuses these writes on
 * anything else regardless, so this is about not offering what cannot be done.
 */
export function DocumentTerms({ invoice, options }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, startAdding] = useTransition()

  const [validDays, setValidDays] = useState(String(invoice.valid_days ?? 15))
  const [paymentTerms, setPaymentTerms] = useState(invoice.payment_terms ?? '')
  const [delivery, setDelivery] = useState(invoice.delivery_timeline ?? '')
  const [scope, setScope] = useState(invoice.installation_scope ?? '')
  const [visitRate, setVisitRate] = useState(
    invoice.visit_rate === null || invoice.visit_rate === undefined ? '' : String(invoice.visit_rate)
  )
  const [visitCount, setVisitCount] = useState(
    invoice.visit_count === null || invoice.visit_count === undefined
      ? ''
      : String(invoice.visit_count)
  )
  const [newOption, setNewOption] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  // A scope carried over from a duplicated document can name an option that has
  // since been removed from the list. Dropping it silently would quietly change
  // what the document says, so the missing label is offered as its own entry.
  const known = options.some((o) => o.label === scope)
  const busy = pending || adding

  function save() {
    startTransition(async () => {
      const result = await setDocumentTerms({
        invoice_id: invoice.id,
        valid_days: validDays,
        payment_terms: paymentTerms,
        delivery_timeline: delivery,
        installation_scope: scope,
        visit_rate: visitRate,
        visit_count: visitCount,
      })
      if (result.ok) {
        toast.success('Terms saved')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function addOption() {
    const label = newOption.trim()
    if (label.length < 2) {
      toast.error('Type the installation scope before adding it.')
      return
    }
    startAdding(async () => {
      const result = await addInstallationOption(label)
      if (result.ok) {
        // Selected straight away — nobody adds an option to a dropdown in the
        // middle of writing a quotation and then wants to go and find it.
        setScope(label)
        setNewOption('')
        setShowAdd(false)
        toast.success('Added to the list')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <section className="rounded-lg border bg-card p-4 print:hidden">
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="font-medium">Terms on this document</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        These print at the top and foot of the sheet. They belong to this document alone — changing
        them here changes nothing on any other one, and nothing can be changed once it is issued.
      </p>

      <div className="mt-4 space-y-4">
        <Field
          label="Valid for"
          htmlFor="valid_days"
          hint={
            Number.isFinite(Number(validDays))
              ? `The sheet prints “Valid till: ${validTill(invoice.doc_date, Number(validDays))}”`
              : 'Days from the document date'
          }
        >
          <Input
            id="valid_days"
            type="number"
            min={0}
            max={365}
            value={validDays}
            disabled={busy}
            onChange={(e) => setValidDays(e.target.value)}
          />
        </Field>

        <Field
          label="Payment terms"
          htmlFor="payment_terms"
          hint="Printed as written. e.g. 100% against tax invoice."
        >
          <Textarea
            id="payment_terms"
            rows={2}
            value={paymentTerms}
            disabled={busy}
            onChange={(e) => setPaymentTerms(e.target.value)}
          />
        </Field>

        <Field
          label="Delivery timeline"
          htmlFor="delivery_timeline"
          hint="e.g. 4-6 Weeks from Order Confirmation."
        >
          <Textarea
            id="delivery_timeline"
            rows={2}
            value={delivery}
            disabled={busy}
            onChange={(e) => setDelivery(e.target.value)}
          />
        </Field>

        <Field
          label="Site installation"
          htmlFor="installation_scope"
          hint="Leave unset to print no installation line at all"
        >
          <Select
            id="installation_scope"
            value={scope}
            disabled={busy}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="">Not applicable</option>
            {options.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
            {scope !== '' && !known && <option value={scope}>{scope}</option>}
          </Select>
        </Field>

        {showAdd ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row">
            <Input
              aria-label="New installation scope"
              placeholder="e.g. Site Installation & Commissioning"
              value={newOption}
              disabled={adding}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addOption()
                }
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={addOption} disabled={adding}>
                {adding && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAdd(false)
                  setNewOption('')
                }}
                disabled={adding}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} disabled={busy}>
            <Plus className="h-4 w-4" aria-hidden />
            Add an installation option
          </Button>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Visit rate (₹)"
            htmlFor="visit_rate"
            hint="Leave blank to charge nothing for visits"
          >
            <Input
              id="visit_rate"
              type="number"
              min={0}
              step="0.01"
              value={visitRate}
              disabled={busy}
              onChange={(e) => setVisitRate(e.target.value)}
            />
          </Field>

          <Field label="Number of visits" htmlFor="visit_count" hint="Leave blank to print no count">
            <Input
              id="visit_count"
              type="number"
              min={0}
              max={999}
              value={visitCount}
              disabled={busy}
              onChange={(e) => setVisitCount(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save terms
          </Button>
        </div>
      </div>
    </section>
  )
}
