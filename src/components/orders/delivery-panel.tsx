'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ORDER_STATUS } from '@/lib/constants'
import { formatDate } from '@/lib/format'
import { updateOrderDetails } from '@/app/(app)/orders/actions'
import { OrderStatusBadge } from './order-status-badge'
import type { OrderRow, OrderStatus } from '@/types/database'

/** Delivery, status, PO and notes. Deliberately no money fields. */
export function DeliveryPanel({
  order,
  deliveryOverdue,
}: {
  order: OrderRow
  deliveryOverdue: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [status, setStatus] = useState<OrderStatus>(order.order_status)
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date ?? '')
  const [poNumber, setPoNumber] = useState(order.po_number ?? '')
  const [notes, setNotes] = useState(order.notes ?? '')

  function submit() {
    setErrors({})
    startTransition(async () => {
      const result = await updateOrderDetails({
        order_id: order.id,
        order_status: status,
        delivery_date: deliveryDate,
        po_number: poNumber || undefined,
        notes: notes || undefined,
      })

      if (result.ok) {
        toast.success('Order updated')
        setOpen(false)
        router.refresh()
      } else {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  return (
    <Card className={deliveryOverdue ? 'border-overdue/40' : undefined}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Delivery</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </Button>
      </CardHeader>

      <CardContent>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <OrderStatusBadge status={order.order_status} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Delivery date</dt>
            <dd className={deliveryOverdue ? 'font-medium text-overdue' : undefined}>
              {formatDate(order.delivery_date)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">PO number</dt>
            <dd>{order.po_number ?? '—'}</dd>
          </div>
        </dl>

        {deliveryOverdue && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-overdue/30 bg-overdue/5 p-3 text-sm text-overdue">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Delivery date has passed and the order is still open.
          </p>
        )}

        {order.notes && (
          <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm text-muted-foreground">
            {order.notes}
          </p>
        )}
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Update order"
        description="Money figures are calculated from the payments ledger and cannot be edited here."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status" htmlFor="order_status">
              <Select
                id="order_status"
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
              >
                {optionsFrom(ORDER_STATUS)}
              </Select>
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

          <Field label="Notes" htmlFor="order_notes">
            <Textarea
              id="order_notes"
              rows={3}
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
              Save changes
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
