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
import { ITEM_UNIT } from '@/lib/constants'
import { formatMoney } from '@/lib/format'
import { removeOrderItem, saveOrderItem } from '@/app/(app)/orders/actions'
import type { CurrencyCode, OrderItemRow } from '@/types/database'

type Props = {
  orderId: string
  items: OrderItemRow[]
  /** The order's currency. Lines are priced in it; they never carry their own. */
  currency: CurrencyCode
}

type Draft = {
  id?: string
  description: string
  hsn_sac: string
  quantity: string
  unit: string
  rate: string
  notes: string
}

const EMPTY: Draft = {
  description: '',
  hsn_sac: '',
  quantity: '1',
  unit: 'nos',
  rate: '',
  notes: '',
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
export function LineItems({ orderId, items, currency }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [removingId, setRemovingId] = useState<string>()

  const subtotal = items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
  const missingHsn = items.filter((item) => !item.hsn_sac).length

  function edit(item: OrderItemRow) {
    setDraft(toDraft(item))
    setFieldErrors({})
    setError(undefined)
    setOpen(true)
  }

  function add() {
    setDraft(EMPTY)
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

  function remove(item: OrderItemRow) {
    if (!confirm(`Remove line ${item.line_no} — ${item.description}?`)) return
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
                    <th className="py-2 text-right font-medium">Amount</th>
                    <th className="w-20 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 align-top">
                      <td className="py-2 tnum text-muted-foreground">{item.line_no}</td>
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
                      <td className="py-2 text-right tnum font-medium">
                        {formatMoney(item.amount, currency, true)}
                      </td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit line ${item.line_no}`}
                            onClick={() => edit(item)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove line ${item.line_no}`}
                            disabled={pending && removingId === item.id}
                            onClick={() => remove(item)}
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
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Line {item.line_no}</p>
                      <p className="font-medium">{item.description}</p>
                    </div>
                    <p className="tnum font-semibold">{formatMoney(item.amount, currency, true)}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground tnum">
                    {item.quantity} {ITEM_UNIT[item.unit]} × {formatMoney(item.rate, currency, true)}
                    {item.hsn_sac ? ` · HSN ${item.hsn_sac}` : ''}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => edit(item)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(item)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between border-t pt-3 text-sm font-semibold">
              <span>Order value (excl. GST)</span>
              <span className="tnum">{formatMoney(subtotal, currency, true)}</span>
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

            <Field label="Rate (₹)" htmlFor="li_rate" required error={fieldErrors.rate}>
              <Input
                id="li_rate"
                inputMode="decimal"
                value={draft.rate}
                onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
              />
            </Field>
          </div>

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
              Amount: <span className="tnum font-semibold">{formatMoney(preview, currency, true)}</span>
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
