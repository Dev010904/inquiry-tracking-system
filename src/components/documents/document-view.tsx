'use client'

import { useState } from 'react'
import { DocumentActions } from '@/components/documents/document-actions'
import { DocumentLifecycle } from '@/components/documents/document-lifecycle'
import { PrintableDocument } from '@/components/documents/printable-document'
import type { InvoiceCopy } from '@/lib/constants'
import type {
  CompanyRow,
  CompanySettingsRow,
  ContactRow,
  InvoiceLineRow,
  InvoiceRow,
} from '@/types/database'

type Props = {
  invoice: InvoiceRow
  lines: InvoiceLineRow[]
  settings: CompanySettingsRow | null
  /** Live client record and contact — a draft preview only. */
  company: CompanyRow | null
  contact: ContactRow | null
  isAdmin: boolean
}

/**
 * Holds which copies are selected, so the toolbar and the printed pages stay
 * in step. Defaults to the original only — printing three copies of every
 * proforma wastes paper, and the transporter copy is only meaningful once
 * goods actually move.
 */
export function DocumentView({ invoice, lines, settings, company, contact, isAdmin }: Props) {
  const [copies, setCopies] = useState<InvoiceCopy[]>(['original'])

  return (
    <div className="space-y-4">
      <DocumentLifecycle
        invoiceId={invoice.id}
        docType={invoice.doc_type}
        docNo={invoice.doc_no}
        status={invoice.status}
        isAdmin={isAdmin}
      />

      <DocumentActions
        invoiceId={invoice.id}
        docType={invoice.doc_type}
        status={invoice.status}
        isAdmin={isAdmin}
        copies={copies}
        onCopiesChange={setCopies}
      />

      <PrintableDocument
        invoice={invoice}
        lines={lines}
        settings={settings}
        buyerFallback={
          company
            ? {
                name: company.name,
                address: company.address,
                city: company.city,
                state: company.state,
                gstin: company.gstin,
                contact_name: contact?.name ?? null,
                contact_phone: contact?.phone ?? null,
              }
            : null
        }
        copies={copies.length > 0 ? copies : ['original']}
      />
    </div>
  )
}
