import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Skeleton className="h-9 w-40" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <Skeleton className="h-11 w-full" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </Card>
      <Card className="divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </Card>
    </div>
  )
}
