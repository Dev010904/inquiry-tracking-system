'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { acceptQuotation } from '@/app/(app)/documents/actions'

/**
 * Turns an accepted quotation into an order.
 *
 * The quoted lines become the order's lines, so the order is priced at exactly
 * what the client agreed to and nobody retypes it. The technical specification
 * is asked for here because converting an inquiry has always required one, and
 * this is the same event by another route.
 */
export function AcceptQuotation({ quotationId }: { quotationId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [spec, setSpec] = useState('')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(undefined)
    startTransition(async () => {
      const result = await acceptQuotation(quotationId, spec)
      if (result.ok) {
        toast.success('Order created from this quotation')
        setOpen(false)
        router.push(`/orders/${result.id}`)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Client accepted?</CardTitle>
          <p className="text-sm text-muted-foreground">
            Creates the order and carries every line across.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Accept &amp; create order
        </Button>
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">
          The quotation itself stays exactly as it was issued.
        </p>
      </CardContent>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Accept this quotation"
        description="The quoted lines become the order's lines."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Field
            label="Technical specification"
            htmlFor="aq_spec"
            required
            hint="What is actually being supplied — recorded against the order"
          >
            <Textarea
              id="aq_spec"
              rows={4}
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || spec.trim().length < 3}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Create order
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
