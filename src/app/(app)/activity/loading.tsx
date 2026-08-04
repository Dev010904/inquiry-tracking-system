import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function ActivityLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Skeleton className="h-9 w-52" />
      <Card className="flex gap-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-44" />
        ))}
      </Card>
      <Card className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="p-3">
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </Card>
    </div>
  )
}
