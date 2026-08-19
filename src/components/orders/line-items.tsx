'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Table2, Trash2 } from 'lucide-react'
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
import { removeOrderItem, saveOrderItem } from '@/app/(app)/orders/actions'
import type { CurrencyCode, OrderItemRow } from '@/types/database'

type Props = {
  orderId: string
  items: OrderItemRow[]
  /** The order's currency. Lines are priced in it; they never carry their own. */
  currency: CurrencyCode
  /** `company_settings.default_gst_rate` — what a brand-new line starts at. */
  defaultGstRate: number
  /**
   * The buyer's recorded exemption reason, if it has one. When present, a 0%
   * line does not need its own reason: Postgres copies this onto the line.
   */
  companyExemptionReason: string | null
}

type Draft = {
  id?: string
  description: string
  hsn_sac: string
  quantity: string
  unit: string
  rate: string
  notes: string
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
    notes: '',
    gst_rate: String(defaultGstRate),
    zero_rate_reason: '',
  }
}

function toDraft(item: OrderItemRow): Draft {
  return {
    id: item.id,
    description: item.description,
    hsn_sac: item.hsn_sac ?? '',
    quantity: String(item.quantity),
    unit: item.unit,
    rate: String(item.rate),
    notes: item.notes ?? '',
    gst_rate: String(item.gst_rate ?? 0),
    zero_rate_reason: item.zero_rate_reason ?? '',
  }
}

/**
 * The lines that make up the order.
 *
 * This is the only place the order's value can be changed. Each line's amount
 * is computed by Postgres, and a trigger sums the lines into the order value —
 * so the Financials card below always agrees with what is listed here, and
 * nobody can type a total that the lines do not support.
 *
 * HSN/SAC is captured per line because a tax invoice is invalid without it.
 * It is optional here so a line can be added before the code is looked up,
 * but invoicing will refuse to issue until every line has one.
 */
export function LineItems({
  orderId,
  items,
  currency,
  defaultGstRate,
  companyExemptionReason,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultGstRate))
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [removingId, setRemovingId] = useState<string>()

  const subtotal = items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
  const missingHsn = items.filter((item) => !item.hsn_sac).length

  /**
   * One row per rate, taxable value and tax summed within it.
   *
   * Tax is rounded on each line and then added up, matching what Postgres
   * stores. Applying a rate to the slab subtotal instead would drift by a
   * paisa or two and stop the printed document reconciling with the order.
   */
  const slabs = Array.from(
    items
      .reduce((acc, item) => {
        const rate = Number(item.gst_rate ?? 0)
        const amount = Number(item.amount ?? 0)
        const row = acc.get(rate) ?? { rate, taxable: 0, tax: 0 }
        row.taxable += amount
        row.tax += Math.round(amount * rate) / 100
        acc.set(rate, row)
        return acc
      }, new Map<number, { rate: number; taxable: number; tax: number }>())
      .values()
  ).sort((a, b) => a.rate - b.rate)

  const totalTax = slabs.reduce((sum, slab) => sum + slab.tax, 0)

  function edit(item: OrderItemRow) {
    setDraft(toDraft(item))
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
      const result = await saveOrderItem({ ...draft, order_id: orderId })
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

  function remove(item: OrderItemRow, position: number) {
    if (!confirm(`Remove line ${position} — ${item.description}?`)) return
    setRemovingId(item.id)
    startTransition(async () => {
      const result = await removeOrderItem(item.id, orderId)
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
        <CardTitle className="flex items-center gap-2 text-base">
          <Table2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          Line items
        </CardTitle>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" aria-hidden />
          Add line
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No lines yet. The order value stays at zero until something is listed here.
          </p>
        ) : (
          <>
            {/* Table on desktop, stacked cards on phones — this is used on site. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-2 font-medium">#</th>
                    <th className="py-2 font-medium">Description</th>
                    <th className="py-2 font-medium">HSN/SAC</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Rate</th>
                    <th className="py-2 text-right font-medium">GST</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                    <th className="w-20 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} className="border-b last:border-0 align-top">
                      {/*
                       * Position, not `line_no`. `line_no` is max+1 and never
                       * reused, so a removed line leaves a hole in the numbers
                       * the reader sees. Same fix as the document lines.
                       */}
                      <td className="py-2 tnum text-muted-foreground">{index + 1}</td>
                      <td className="py-2">
                        <p className="font-medium">{item.description}</p>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground">{item.notes}</p>
                        )}
                      </td>
                      <td className="py-2 tnum text-muted-foreground">
                        {item.hsn_sac ?? <span className="text-overdue">—</span>}
                      </td>
                      <td className="py-2 text-right tnum">
                        {item.quantity} {ITEM_UNIT[item.unit]}
                      </td>
                      <td className="py-2 text-right tnum">{formatMoney(item.rate, currency, true)}</td>
                      <td className="py-2 text-right tnum">
                        {Number(item.gst_rate ?? 0)}%
                        {Number(item.gst_rate ?? 0) === 0 && item.zero_rate_reason && (
                          <span
                            className="block text-xs font-normal text-muted-foreground"
                            title={item.zero_rate_reason}
                          >
                            {item.zero_rate_reason}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tnum font-medium">
                        {formatMoney(item.amount, currency, true)}
                      </td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit line ${index + 1}`}
                            onClick={() => edit(item)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove line ${index + 1}`}
                            disabled={pending && removingId === item.id}
                            onClick={() => remove(item, index + 1)}
                          >
                            {pending && removingId === item.id ? (
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

            <ul className="space-y-2 md:hidden">
              {items.map((item, index) => (
                <li key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Line {index + 1}</p>
                      <p className="font-medium">{item.description}</p>
                    </div>
                    <p className="tnum font-semibold">{formatMoney(item.amount, currency, true)}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground tnum">
                    {item.quantity} {ITEM_UNIT[item.unit]} × {formatMoney(item.rate, currency, true)}
                    {` · GST ${Number(item.gst_rate ?? 0)}%`}
                    {item.hsn_sac ? ` · HSN ${item.hsn_sac}` : ''}
                  </p>
                  {Number(item.gst_rate ?? 0) === 0 && item.zero_rate_reason && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.zero_rate_reason}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => edit(item)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(item, index + 1)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex items-baseline justify-between font-semibold">
                <span>Order value (excl. GST)</span>
                <span className="tnum">{formatMoney(subtotal, currency, true)}</span>
              </div>

              {/* One row per slab. A single "GST @ 18%" line would be a lie the
                  moment an order carries two rates. */}
              {slabs.map((slab) => (
                <div
                  key={slab.rate}
                  className="flex items-baseline justify-between text-muted-foreground"
                >
                  <span>
                    GST @ {slab.rate}% on {formatMoney(slab.taxable, currency, true)}
                  </span>
                  <span className="tnum">{formatMoney(slab.tax, currency, true)}</span>
                </div>
              ))}

              <div className="flex items-baseline justify-between border-t pt-1 font-semibold">
                <span>Total incl. GST</span>
                <span className="tnum">{formatMoney(subtotal + totalTax, currency, true)}</span>
              </div>
            </div>
          </>
        )}

        {missingHsn > 0 && (
          <p className="text-xs text-overdue">
            {missingHsn} {missingHsn === 1 ? 'line has' : 'lines have'} no HSN/SAC code. A tax
            invoice cannot be issued until every line has one.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          The order value below is the sum of these lines, calculated by the database. Change a
          quantity or rate here and the GST, total and balance follow automatically.
        </p>
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

          <Field
            label="Description"
            htmlFor="li_description"
            required
            error={fieldErrors.description}
          >
            <Textarea
              id="li_description"
              rows={2}
              value={draft.description}
              placeholder="Automated bottle filling machine — 4 head, SS316 contact parts"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantity" htmlFor="li_quantity" required error={fieldErrors.quantity}>
              <Input
                id="li_quantity"
                inputMode="decimal"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
              />
            </Field>

            <Field label="Unit" htmlFor="li_unit" required error={fieldErrors.unit}>
              <Select
                id="li_unit"
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              >
                {optionsFrom(ITEM_UNIT)}
              </Select>
            </Field>

            <Field label="Rate" htmlFor="li_rate" required error={fieldErrors.rate}>
              <Input
                id="li_rate"
                inputMode="decimal"
                value={draft.rate}
                onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="GST rate"
              htmlFor="li_gst_slab"
              required
              hint={`Company default is ${defaultGstRate}%`}
            >
              <Select
                id="li_gst_slab"
                value={GST_SLABS.some((slab) => String(slab) === draft.gst_rate) ? draft.gst_rate : 'other'}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    // "Other" keeps whatever is typed rather than snapping the
                    // field back to a slab and losing the entered rate.
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

            <Field label="Rate applied (%)" htmlFor="li_gst_rate" required error={fieldErrors.gst_rate}>
              <Input
                id="li_gst_rate"
                inputMode="decimal"
                value={draft.gst_rate}
                onChange={(e) => setDraft({ ...draft, gst_rate: e.target.value })}
              />
            </Field>
          </div>

          {Number(draft.gst_rate) === 0 && (
            <Field
              label="Why is this line 0%?"
              htmlFor="li_zero_reason"
              required={!companyExemptionReason}
              error={fieldErrors.zero_rate_reason}
              hint={
                companyExemptionReason
                  ? `Leave blank to use the buyer's recorded reason: ${companyExemptionReason}`
                  : 'A zero-rated line and an exempt line print differently, so the document has to say which'
              }
            >
              <Input
                id="li_zero_reason"
                value={draft.zero_rate_reason}
                placeholder="Exempt under Notification 12/2017 — Central Tax (Rate)"
                onChange={(e) => setDraft({ ...draft, zero_rate_reason: e.target.value })}
              />
            </Field>
          )}

          <Field
            label="HSN / SAC code"
            htmlFor="li_hsn"
            error={fieldErrors.hsn_sac}
            hint="Required before a tax invoice can be issued for this order"
          >
            <Input
              id="li_hsn"
              inputMode="numeric"
              value={draft.hsn_sac}
              placeholder="8422"
              onChange={(e) => setDraft({ ...draft, hsn_sac: e.target.value })}
            />
          </Field>

          <Field label="Line note" htmlFor="li_notes" error={fieldErrors.notes}>
            <Input
              id="li_notes"
              value={draft.notes}
              placeholder="Optional — shown under the description"
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>

          {preview !== null && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Amount:{' '}
              <span className="tnum font-semibold">{formatMoney(preview, currency, true)}</span>
              {Number(draft.gst_rate) > 0 && (
                <>
                  {' '}
                  + GST {Number(draft.gst_rate)}%{' '}
                  <span className="tnum font-semibold">
                    {formatMoney(Math.round(preview * Number(draft.gst_rate)) / 100, currency, true)}
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
