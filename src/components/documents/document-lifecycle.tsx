'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, FileWarning, Loader2, Lock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { deleteDraft, duplicateDocument } from '@/app/(app)/documents/actions'
import { DOCUMENT_TYPE } from '@/lib/constants'
import type { DocumentStatus, DocumentType } from '@/types/database'

type Props = {
  invoiceId: string
  docType: DocumentType
  docNo: string | null
  status: DocumentStatus
  isAdmin: boolean
}

/**
 * Where the line falls between a draft and an issued document.
 *
 * The owner asked for an issued invoice that stays editable and can be
 * deleted. Both of those already exist — on a draft — and neither is lawful
 * afterwards. What was missing was anywhere on the screen that said so, so he
 * had no way to know he already had what he wanted. This panel says it, in the
 * two places it matters, at the moment it matters.
 */
export function DocumentLifecycle({ invoiceId, docType, docNo, status, isAdmin }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string>()

  const noun = DOCUMENT_TYPE[docType].toLowerCase()

  function remove() {
    setError(undefined)
    startTransition(async () => {
      const result = await deleteDraft(invoiceId)
      if (result.ok) {
        toast.success('Draft deleted')
        router.push('/documents')
      } else {
        setError(result.error)
      }
    })
  }

  function duplicate() {
    setError(undefined)
    startTransition(async () => {
      const result = await duplicateDocument(invoiceId)
      if (result.ok && result.id) {
        toast.success('Copied to a new draft')
        router.push(`/documents/${result.id}`)
      } else if (!result.ok) {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="print:hidden">
      {status === 'draft' && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start gap-2.5">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">This is a draft. Nothing is final yet.</p>
              <p className="mt-0.5 text-muted-foreground">
                It carries no number, the lines can be changed as often as you like, and it can
                be deleted outright leaving no trace. <strong>Issue</strong> is what makes it
                permanent: it takes the next number in the series, freezes our details and the
                customer&rsquo;s onto it, and after that it cannot be edited or deleted — only
                cancelled, or corrected with a credit or debit note.
              </p>
              {isAdmin && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmDelete(true)}
                    disabled={pending}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete this draft
                  </Button>
                  <Button size="sm" variant="outline" onClick={duplicate} disabled={pending}>
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                    Duplicate
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'issued' && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                Issued as {docNo}. This {noun} is now a permanent record.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                It cannot be edited or deleted — the customer holds a copy and the number may
                already be reported. To correct the value, raise a credit or debit note. To
                withdraw it entirely, cancel it: the number stays in the series marked cancelled,
                which is what an auditor expects to find. To send a corrected version, duplicate
                it, fix the copy, and issue that.
              </p>
              <div className="mt-2.5">
                <Button size="sm" variant="outline" onClick={duplicate} disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                  Duplicate to a new draft
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {status === 'cancelled' && (
        <div className="rounded-lg border border-overdue/40 bg-overdue/5 p-3">
          <div className="flex items-start gap-2.5">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-overdue" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-overdue">
                Cancelled. {docNo} stays in the series and is not reused.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                It counts towards no total and appears in no report. Report this number as
                cancelled when filing. If the supply still needs invoicing, that is a new number
                — duplicate this document and issue the copy.
              </p>
              <div className="mt-2.5">
                <Button size="sm" variant="outline" onClick={duplicate} disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                  Duplicate to a new draft
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => !pending && setConfirmDelete(false)}
        title="Delete this draft?"
        description="The draft and its lines are removed for good. No number has been used, so nothing is left behind in the series and there is nothing to report."
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Delete draft
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
