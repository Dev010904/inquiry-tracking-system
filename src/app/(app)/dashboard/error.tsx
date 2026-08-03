'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-overdue" aria-hidden />
      <h2 className="mt-3 font-semibold">Could not load the dashboard</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The connection to the database failed. Your data is unaffected.
      </p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </Card>
  )
}
