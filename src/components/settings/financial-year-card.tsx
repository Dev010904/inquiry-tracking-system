'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { setActiveFinancialYear } from '@/app/(app)/settings/actions'

type Props = {
  /** The year the screens are showing now. */
  active: string
  /** The year we are actually in. */
  current: string
  /** Every year the business has traded in, newest first. */
  options: string[]
}

/**
 * Choosing which financial year the system is showing.
 *
 * The books run 1 April to 31 March. Every list in the app — inquiries,
 * orders, documents, payments, meetings — shows the chosen year and nothing
 * before it, so on 1 April the system opens empty and the new year starts
 * clean. What does NOT reset is money still owed: an order raised last year
 * and still unpaid keeps its balance on the ledger, because the debt did not
 * end with the year.
 *
 * The choice lives with the person who made it, not with the company, so an
 * admin reading last year's figures never changes what staff on the shop floor
 * are looking at.
 */
export function FinancialYearCard({ active, current, options }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState(active)

  function save() {
    startTransition(async () => {
      const result = await setActiveFinancialYear(choice)
      if (result.ok) {
        toast.success(
          choice === current
            ? `Back to the current year, ${current}`
            : `Now showing ${choice} — a closed year, so nothing here can be added to`
        )
        router.refresh()
      } else {
        toast.error(result.error)
        setChoice(active)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
          Financial year
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The books run 1 April to 31 March. Every list shows the year chosen here and nothing
          before it, so a new year starts clean. Money still owed from an earlier year stays on
          the ledger — a debt does not end because the year did.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Showing" htmlFor="fy-picker" className="min-w-[12rem] flex-1">
            <Select
              id="fy-picker"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
              disabled={pending}
            >
              {options.map((fy) => (
                <option key={fy} value={fy}>
                  {fy}
                  {fy === current ? ' — current' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={save} disabled={pending || choice === active}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Show this year
          </Button>
        </div>

        {active !== current && (
          <p className="rounded-lg border border-duesoon/40 bg-duesoon/10 px-3 py-2 text-sm">
            You are looking at <strong>{active}</strong>, which has closed. New records are always
            filed in {current}, whatever is selected here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
