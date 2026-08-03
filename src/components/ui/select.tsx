import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Native <select>. On phones this gives the OS picker, which beats any
 * custom dropdown for one-handed use — and it is accessible for free.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'flex h-11 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden
    />
  </div>
))
Select.displayName = 'Select'

/** Builds <option> list from a `{ value: label }` constant map. */
export function optionsFrom(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ))
}
