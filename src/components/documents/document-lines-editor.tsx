'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { GST_SLABS, ITEM_UNIT } from '@/lib/constants'
import { formatMoney } from '@/lib/format'
import { removeDocumentLine, saveDocumentLine } from '@/app/(app)/documents/actions'
import type { InvoiceLineRow } from '@/types/database'

type Props = {
  invoiceId: string
  lines: InvoiceLineRow[]
  defaultGstRate: number
  /** False for a challan, which carries no tax at all. */
  showsTax: boolean
}

type Draft = {
  id?: string
  description: string
  hsn_sac: string
  quantity: string
  unit: string
  rate: string
  gst_rate: string
  zero_rate_reason: string
}

function emptyDraft(defaultGstRate: number): Draft {
  return {
    description: '',
    hsn_sac: '',
    quantity: '1',
    unit: 'nos',
    rate: '',
    gst_rate: String(defaultGstRate),
    zero_rate_reason: '',
  }
}

function toDraft(line: InvoiceLineRow): Draft {
  return {
    id: line.id,
    description: line.description,
    hsn_sac: line.hsn_sac ?? '',
    quantity: String(line.quantity),
    unit: line.unit,
    rate: String(line.rate),
    gst_rate: String(line.gst_rate ?? 0),
    zero_rate_reason: line.zero_rate_reason ?? '',
  }
}

const money = (v: number | string | null | undefined) => formatMoney(v, 'INR', true)

/**
 * The lines on a draft document.
 *
 * Only reachable while the document is a draft — an issued document is frozen
 * by `guard_issued_document_lines()` in Postgres, so this is a convenience, not
 * the control. It exists mainly for quotations, which are raised against an
 * inquiry and therefore have no order lines to copy from.
 *
 * Every total under the table is written by the database after each edit. None
 * of the figures here are sent back as the document's own.
 */
export function DocumentLinesEditor({ invoiceId, lines, defaultGstRate, showsTax }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultGstRate))
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [removingId, setRemovingId] = useState<string>()

  function edit(line: InvoiceLineRow) {
    setDraft(toDraft(line))
    setFieldErrors({})
    setError(undefined)
    setOpen(true)
  }

  function add() {
    setDraft(emptyDraft(defaultGstRate))
    setFieldErrors({})
    setError(undefined)
    setOpen(true)
  }

  function submit() {
    setError(undefined)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveDocumentLine({ ...draft, invoice_id: invoiceId })
      if (result.ok) {
        toast.success(draft.id ? 'Line updated' : 'Line added')
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error)
        setFieldErrors(result.fieldErrors ?? {})
      }
    })
  }

  function remove(line: InvoiceLineRow) {
    if (!confirm(`Remove line ${line.line_no} — ${line.description}?`)) return
    setRemovingId(line.id)
    startTransition(async () => {
      const result = await removeDocumentLine(line.id, invoiceId)
      setRemovingId(undefined)
      if (result.ok) {
        toast.success('Line removed')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const preview =
    Number(draft.quantity) > 0 && draft.rate !== ''
      ? Math.round(Number(draft.quantity) * Number(draft.rate) * 100) / 100
      : null

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Lines</CardTitle>
          <p className="text-sm text-muted-foreground">
            This document is a draft. Lines can still be changed.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" aria-hidden />
          Add line
        </Button>
      </CardHeader>

      <CardContent>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No lines yet. A document cannot be issued until it lists something.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 py-2 font-medium">#</th>
                  <th className="py-2 font-medium">Description</th>
                  <th className="py-2 font-medium">HSN/SAC</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  {showsTax && <th className="py-2 text-right font-medium">GST</th>}
                  <th className="py-2 text-right font-medium">Amount</th>
                  <th className="w-20 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b last:border-0 align-top">
                    <td className="py-2 tnum text-muted-foreground">{line.line_no}</td>
                    <td className="py-2">
                      <p className="font-medium">{line.description}</p>
                      {Number(line.gst_rate ?? 0) === 0 && line.zero_rate_reason && (
                        <p className="text-xs text-muted-foreground">{line.zero_rate_reason}</p>
                      )}
                    </td>
                    <td className="py-2 tnum text-muted-foreground">{line.hsn_sac ?? '—'}</td>
                    <td className="py-2 text-right tnum">
                      {line.quantity} {ITEM_UNIT[line.unit]}
                    </td>
                    <td className="py-2 text-right tnum">{money(line.rate)}</td>
                    {showsTax && (
                      <td className="py-2 text-right tnum">{Number(line.gst_rate ?? 0)}%</td>
                    )}
                    <td className="py-2 text-right tnum font-medium">
                      {money(line.taxable_value)}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit line ${line.line_no}`}
                          onClick={() => edit(line)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove line ${line.line_no}`}
                          disabled={pending && removingId === line.id}
                          onClick={() => remove(line)}
                        >
                          {pending && removingId === line.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={draft.id ? 'Edit line' : 'Add line'}
        description="Amount is calculated as quantity × rate."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Field label="Description" htmlFor="dl_description" required error={fieldErrors.description}>
            <Textarea
              id="dl_description"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantity" htmlFor="dl_quantity" required error={fieldErrors.quantity}>
              <Input
                id="dl_quantity"
                inputMode="decimal"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
              />
            </Field>
            <Field label="Unit" htmlFor="dl_unit" required error={fieldErrors.unit}>
              <Select
                id="dl_unit"
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              >
                {optionsFrom(ITEM_UNIT)}
              </Select>
            </Field>
            <Field label="Rate" htmlFor="dl_rate" required error={fieldErrors.rate}>
              <Input
                id="dl_rate"
                inputMode="decimal"
                value={draft.rate}
                onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
              />
            </Field>
          </div>

          {showsTax && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="GST rate" htmlFor="dl_gst_slab" required>
                <Select
                  id="dl_gst_slab"
                  value={
                    GST_SLABS.some((slab) => String(slab) === draft.gst_rate)
                      ? draft.gst_rate
                      : 'other'
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      gst_rate: e.target.value === 'other' ? draft.gst_rate : e.target.value,
                    })
                  }
                >
                  {GST_SLABS.map((slab) => (
                    <option key={slab} value={String(slab)}>
                      {slab}%
                    </option>
                  ))}
                  <option value="other">Other…</option>
                </Select>
              </Field>
              <Field
                label="Rate applied (%)"
                htmlFor="dl_gst_rate"
                required
                error={fieldErrors.gst_rate}
              >
                <Input
                  id="dl_gst_rate"
                  inputMode="decimal"
                  value={draft.gst_rate}
                  onChange={(e) => setDraft({ ...draft, gst_rate: e.target.value })}
                />
              </Field>
            </div>
          )}

          {showsTax && Number(draft.gst_rate) === 0 && (
            <Field
              label="Why is this line 0%?"
              htmlFor="dl_zero_reason"
              error={fieldErrors.zero_rate_reason}
              hint="A zero-rated line and an exempt line print differently, so the document has to say which"
            >
              <Input
                id="dl_zero_reason"
                value={draft.zero_rate_reason}
                onChange={(e) => setDraft({ ...draft, zero_rate_reason: e.target.value })}
              />
            </Field>
          )}

          <Field
            label="HSN / SAC code"
            htmlFor="dl_hsn"
            error={fieldErrors.hsn_sac}
            hint="Required before a tax invoice can be issued"
          >
            <Input
              id="dl_hsn"
              inputMode="numeric"
              value={draft.hsn_sac}
              onChange={(e) => setDraft({ ...draft, hsn_sac: e.target.value })}
            />
          </Field>

          {preview !== null && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Amount: <span className="tnum font-semibold">{money(preview)}</span>
              {showsTax && Number(draft.gst_rate) > 0 && (
                <>
                  {' '}
                  + GST {Number(draft.gst_rate)}%{' '}
                  <span className="tnum font-semibold">
                    {money(Math.round(preview * Number(draft.gst_rate)) / 100)}
                  </span>
                </>
              )}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {draft.id ? 'Save line' : 'Add line'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
