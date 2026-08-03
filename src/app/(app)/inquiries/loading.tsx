import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function InquiriesLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Skeleton className="h-9 w-48" />
      <Card className="space-y-3 p-4">
        <Skeleton className="h-11 w-full" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </Card>
      <Card className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </Card>
    </div>
  )
}
