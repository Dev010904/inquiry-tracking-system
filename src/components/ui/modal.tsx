'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  className?: string
  children: React.ReactNode
}

/**
 * Built on the native <dialog> element so focus trapping, Escape handling and
 * inertness on the rest of the page come from the browser rather than from a
 * pile of our own event listeners.
 */
export function Modal({ open, onClose, title, description, className, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // Clicking the backdrop lands on the <dialog> itself, not its contents.
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby="modal-title"
      className={cn(
        'w-[calc(100vw-2rem)] max-w-lg rounded-lg border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5">
        <div className="space-y-1">
          <h2 id="modal-title" className="font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">{children}</div>
    </dialog>
  )
}
