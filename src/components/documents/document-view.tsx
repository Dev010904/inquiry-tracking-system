'use client'

import { useState } from 'react'
import { DocumentActions } from '@/components/documents/document-actions'
import { PrintableDocument } from '@/components/documents/printable-document'
import type { InvoiceCopy } from '@/lib/constants'
import type { CompanySettingsRow, InvoiceLineRow, InvoiceRow } from '@/types/database'

type Props = {
  invoice: InvoiceRow
  lines: InvoiceLineRow[]
  settings: CompanySettingsRow | null
  isAdmin: boolean
}

/**
 * Holds which copies are selected, so the toolbar and the printed pages stay
 * in step. Defaults to the original only — printing three copies of every
 * proforma wastes paper, and the transporter copy is only meaningful once
 * goods actually move.
 */
export function DocumentView({ invoice, lines, settings, isAdmin }: Props) {
  const [copies, setCopies] = useState<InvoiceCopy[]>(['original'])

  return (
    <div className="space-y-4">
      <DocumentActions
        invoiceId={invoice.id}
        status={invoice.status}
        isAdmin={isAdmin}
        copies={copies}
        onCopiesChange={setCopies}
      />

      <PrintableDocument
        invoice={invoice}
        lines={lines}
        settings={settings}
        copies={copies.length > 0 ? copies : ['original']}
      />
    </div>
  )
}
