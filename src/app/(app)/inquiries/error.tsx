'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function InquiriesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-overdue" aria-hidden />
      <h2 className="mt-3 font-semibold">Could not load inquiries</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The list failed to load. Nothing has been changed.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </Card>
  )
}
