'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { GST_LABEL } from '@/lib/constants'
import { formatINR, previewOrderTotals } from '@/lib/format'
import { convertToOrder } from '@/app/(app)/inquiries/actions'

type Props = {
  inquiryId: string
  /** False when the status is not quoted/negotiation, or an order exists. */
  enabled: boolean
  disabledReason?: string
  estimatedValue: number | null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ConvertToOrder({ inquiryId, enabled, disabledReason, estimatedValue }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const [orderValue, setOrderValue] = useState(
    estimatedValue != null ? String(estimatedValue) : ''
  )
  const [orderDate, setOrderDate] = useState(today())
  const [deliveryDate, setDeliveryDate] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [technicalSpec, setTechnicalSpec] = useState('')
  const [addendum, setAddendum] = useState('')

  // Preview only. The stored figures are Postgres generated columns; this is
  // here so the number is not a surprise after saving.
  const parsedValue = Number(orderValue)
  const totals = previewOrderTotals(Number.isFinite(parsedValue) ? parsedValue : 0)

  function submit() {
    setErrors({})
    setFormError(undefined)

    startTransition(async () => {
      const result = await convertToOrder({
        inquiry_id: inquiryId,
        order_date: orderDate,
        order_value: orderValue,
        delivery_date: deliveryDate,
        po_number: poNumber || undefined,
        technical_specification: technicalSpec,
        addendum: addendum || undefined,
      })

      if (result.ok) {
        toast.success('Order created and inquiry marked confirmed')
        setOpen(false)
        router.push(`/orders/${result.id}`)
        router.refresh()
      } else {
        setFormError(result.error)
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!enabled}
        title={enabled ? undefined : disabledReason}
      >
        <Package className="h-4 w-4" aria-hidden />
        Convert to order
      </Button>
      {!enabled && disabledReason && (
        <p className="mt-1 text-xs text-muted-foreground">{disabledReason}</p>
      )}

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Convert to confirmed order"
        description="Creates the order and sets this inquiry to Confirmed."
      >
        <div className="space-y-4">
          {formError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {formError}
            </p>
          )}

          <Field
            label="Order value (excl. GST)"
            htmlFor="order_value"
            required
            error={errors.order_value}
            hint="The only money figure you type. Everything below is calculated."
          >
            <Input
              id="order_value"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              value={orderValue}
              onChange={(e) => setOrderValue(e.target.value)}
            />
          </Field>

          <dl className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Order value (excl. GST)</dt>
              <dd className="tnum">{formatINR(totals.orderValue, true)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{GST_LABEL}</dt>
              <dd className="tnum">{formatINR(totals.gstAmount, true)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <dt>Total with GST</dt>
              <dd className="tnum">{formatINR(totals.totalWithGst, true)}</dd>
            </div>
          </dl>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Order date" htmlFor="order_date" required error={errors.order_date}>
              <Input
                id="order_date"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </Field>
            <Field label="Delivery date" htmlFor="delivery_date" error={errors.delivery_date}>
              <Input
                id="delivery_date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="PO number" htmlFor="po_number" error={errors.po_number}>
            <Input id="po_number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </Field>

          <Field
            label="Technical specification"
            htmlFor="technical_specification"
            required
            error={errors.technical_specification}
            hint={
              technicalSpec.trim().length < 20
                ? 'What was agreed, and what production will build to. At least 20 characters.'
                : 'What was agreed, and what production will build to'
            }
          >
            <Textarea
              id="technical_specification"
              rows={5}
              value={technicalSpec}
              placeholder="Quantities, specifications, materials, tolerances, standards, delivery scope."
              onChange={(e) => setTechnicalSpec(e.target.value)}
            />
          </Field>

          <Field
            label="Addendum / changes"
            htmlFor="addendum"
            error={errors.addendum}
            hint="Anything agreed after the original specification. Can be added later."
          >
            <Textarea
              id="addendum"
              rows={2}
              value={addendum}
              onChange={(e) => setAddendum(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || technicalSpec.trim().length < 20}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Create order
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
