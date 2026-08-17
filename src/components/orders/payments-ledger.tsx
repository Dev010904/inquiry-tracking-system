'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, IndianRupee, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PAYMENT_MODE, type PaymentMode } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { addPayment, removePayment } from '@/app/(app)/orders/actions'
import type { CurrencyCode, PaymentRow } from '@/types/database'

type Props = {
  orderId: string
  payments: PaymentRow[]
  balancePending: number
  /** The order's currency. Payments are recorded in it, not per payment. */
  currency: CurrencyCode
  isAdmin: boolean
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PaymentsLedger({ orderId, payments, balancePending, currency, isAdmin }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(today())
  const [mode, setMode] = useState<PaymentMode>('neft')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')

  const parsedAmount = Number(amount)
  const overpaying = Number.isFinite(parsedAmount) && parsedAmount > balancePending && balancePending > 0

  function reset() {
    setAmount('')
    setPaidOn(today())
    setMode('neft')
    setReference('')
    setNote('')
    setErrors({})
    setFormError(undefined)
  }

  function submit() {
    setErrors({})
    setFormError(undefined)

    startTransition(async () => {
      const result = await addPayment({
        order_id: orderId,
        amount,
        paid_on: paidOn,
        mode,
        reference: reference || undefined,
        note: note || undefined,
      })

      if (result.ok) {
        toast.success('Payment recorded')
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setFormError(result.error)
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  function remove(paymentId: string) {
    startTransition(async () => {
      const result = await removePayment(paymentId, orderId)
      if (result.ok) {
        toast.success('Payment removed')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Payments</CardTitle>
          <p className="text-sm text-muted-foreground">
            {payments.length} recorded · {formatMoney(total, currency)}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add payment
        </Button>
      </CardHeader>

      <CardContent>
        {payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <IndianRupee className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Nothing received yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              The balance updates itself as soon as a payment is recorded here.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="tnum font-medium">{formatMoney(payment.amount, currency, true)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(payment.paid_on)} · <Badge variant="muted">{PAYMENT_MODE[payment.mode]}</Badge>
                  </p>
                  {payment.reference && (
                    <p className="text-xs text-muted-foreground">Ref: {payment.reference}</p>
                  )}
                  {payment.note && <p className="mt-0.5 text-sm">{payment.note}</p>}
                </div>

                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label="Remove payment"
                    onClick={() => remove(payment.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Record a payment"
        description="The order balance recalculates from this ledger automatically."
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
            label="Amount received"
            htmlFor="amount"
            required
            error={errors.amount}
            hint={balancePending > 0 ? `Balance pending: ${formatMoney(balancePending, currency, true)}` : undefined}
          >
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          {overpaying && (
            <p className="rounded-md border border-duesoon/40 bg-duesoon/10 p-3 text-sm text-duesoon">
              That is more than the outstanding balance. It will be saved anyway — the order will
              simply show as overpaid.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid on" htmlFor="paid_on" required error={errors.paid_on}>
              <Input
                id="paid_on"
                type="date"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
            <Field label="Mode" htmlFor="mode">
              <Select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
              >
                {optionsFrom(PAYMENT_MODE)}
              </Select>
            </Field>
          </div>

          <Field
            label="Reference"
            htmlFor="reference"
            error={errors.reference}
            hint="UTR, cheque number, transaction id"
          >
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>

          <Field label="Note" htmlFor="payment_note">
            <Textarea
              id="payment_note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !amount}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Record payment
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
