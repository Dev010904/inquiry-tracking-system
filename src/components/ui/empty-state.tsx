import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { buttonVariants } from './button'

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className={buttonVariants({ size: 'sm', className: 'mt-3' })}>
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
