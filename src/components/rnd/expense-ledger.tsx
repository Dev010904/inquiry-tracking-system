'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Plus, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, optionsFrom } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { RND_EXPENSE_KIND, type RndExpenseKind } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'
import { addRndExpense, removeRndExpense } from '@/app/(app)/rnd/actions'
import type { CurrencyCode, RndExpenseRow } from '@/types/database'

type Props = {
  projectId: string
  expenses: RndExpenseRow[]
  budget: number | null
  spent: number
  /** The project's currency. The ledger is denominated in it throughout. */
  currency: CurrencyCode
  isAdmin: boolean
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Itemised R&D spend. The project's `spent_to_date` is the trigger-maintained
 * sum of these rows, so this ledger is the single source of truth for the
 * budget bar — there is no separate figure to keep in step.
 */
export function ExpenseLedger({ projectId, expenses, budget, spent, currency, isAdmin }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(today())
  const [kind, setKind] = useState<RndExpenseKind>('material')
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [reference, setReference] = useState('')

  const remaining = budget != null ? budget - spent : null
  const parsed = Number(amount)
  const wouldExceed =
    remaining != null && Number.isFinite(parsed) && parsed > remaining && remaining > 0

  function submit() {
    setErrors({})
    setFormError(undefined)

    startTransition(async () => {
      const result = await addRndExpense({
        project_id: projectId,
        amount,
        spent_on: spentOn,
        kind,
        description,
        vendor: vendor || undefined,
        reference: reference || undefined,
      })

      if (result.ok) {
        toast.success('Expense recorded')
        setOpen(false)
        setAmount('')
        setDescription('')
        setVendor('')
        setReference('')
        setSpentOn(today())
        router.refresh()
      } else {
        setFormError(result.error)
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
      }
    })
  }

  function remove(expenseId: string) {
    startTransition(async () => {
      const result = await removeRndExpense(expenseId, projectId)
      if (result.ok) {
        toast.success('Expense removed')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Spend ledger</CardTitle>
          <p className="text-sm text-muted-foreground">
            {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'} · {formatMoney(spent, currency)}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add expense
        </Button>
      </CardHeader>

      <CardContent>
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Receipt className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Nothing recorded yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              The budget bar fills from these entries.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="tnum font-medium">{formatMoney(expense.amount, currency, true)}</span>
                    <Badge variant="muted">{RND_EXPENSE_KIND[expense.kind]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(expense.spent_on)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm">{expense.description}</p>
                  {(expense.vendor || expense.reference) && (
                    <p className="text-xs text-muted-foreground">
                      {expense.vendor}
                      {expense.vendor && expense.reference ? ' · ' : ''}
                      {expense.reference && `Ref: ${expense.reference}`}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label="Remove expense"
                    onClick={() => remove(expense.id)}
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
        title="Record an expense"
        description="The project's spend total recalculates from this ledger."
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Amount"
              htmlFor="expense_amount"
              required
              error={errors.amount}
              hint={
                remaining != null ? `${formatMoney(remaining, currency)} left in budget` : undefined
              }
            >
              <Input
                id="expense_amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Spent on" htmlFor="spent_on" required error={errors.spent_on}>
              <Input
                id="spent_on"
                type="date"
                value={spentOn}
                onChange={(e) => setSpentOn(e.target.value)}
              />
            </Field>
          </div>

          {wouldExceed && (
            <p className="rounded-md border border-duesoon/40 bg-duesoon/10 p-3 text-sm text-duesoon">
              This takes the project over its approximate budget. It will still be saved — the
              budget is an estimate, not a limit.
            </p>
          )}

          <Field label="Category" htmlFor="expense_kind">
            <Select
              id="expense_kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as RndExpenseKind)}
            >
              {optionsFrom(RND_EXPENSE_KIND)}
            </Select>
          </Field>

          <Field
            label="What was it for"
            htmlFor="expense_description"
            required
            error={errors.description}
          >
            <Textarea
              id="expense_description"
              rows={2}
              value={description}
              placeholder="Load cells and mounting hardware for the test rig"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor" htmlFor="expense_vendor" error={errors.vendor}>
              <Input
                id="expense_vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </Field>
            <Field
              label="Reference"
              htmlFor="expense_reference"
              error={errors.reference}
              hint="Invoice or bill number"
            >
              <Input
                id="expense_reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !amount || description.trim().length < 3}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Record expense
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
