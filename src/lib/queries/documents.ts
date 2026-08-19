import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { activeFy } from '@/lib/fy-server'
import type {
  CompanyRow,
  ContactRow,
  DocumentStatus,
  DocumentType,
  CompanySettingsRow,
  DocumentNumberRegisterRow,
  InvoiceLineRow,
  InvoiceRow,
  OrderRow,
} from '@/types/database'

export const DOCUMENTS_PAGE_SIZE = 25

/** The supplier's own details. Always exists — the row is created by migration. */
export async function getCompanySettings(): Promise<CompanySettingsRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
  return data ?? null
}

/**
 * What is still missing before any document can be issued.
 *
 * The database enforces this too — this is only so the interface can say so
 * before someone fills in a whole invoice and then hits a wall.
 */
export function missingSettings(settings: CompanySettingsRow | null): string[] {
  if (!settings) return ['company details']
  const missing: string[] = []
  if (!settings.legal_name?.trim()) missing.push('legal name')
  if (!settings.address_line1?.trim()) missing.push('address')
  if (!settings.state_code?.trim()) missing.push('state code')
  if (!settings.gstin?.trim()) missing.push('GSTIN')
  return missing
}

export type DocumentListRow = InvoiceRow & { companyName: string | null }

export async function listDocuments(filters: {
  status?: DocumentStatus
  docType?: DocumentType
  page?: number
}): Promise<{ rows: DocumentListRow[]; total: number; page: number; pageCount: number }> {
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)

  const fy = await activeFy()

  // The register is scoped to the year on show. Numbering already restarts on
  // 1 April, so a register spanning years would list two documents numbered
  // 0001 side by side with nothing to tell them apart.
  let query = supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .gte('doc_date', fy.from)
    .lte('doc_date', fy.to)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.docType) query = query.eq('doc_type', filters.docType)

  const from = (page - 1) * DOCUMENTS_PAGE_SIZE
  const { data, count } = await query
    .order('doc_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + DOCUMENTS_PAGE_SIZE - 1)

  const rows = data ?? []
  const companyIds = [...new Set(rows.map((r) => r.company_id))]
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, name').in('id', companyIds)
    : { data: [] }

  const nameById = new Map((companies ?? []).map((c) => [c.id, c.name]))
  const total = count ?? 0

  return {
    rows: rows.map((row) => ({ ...row, companyName: nameById.get(row.company_id) ?? null })),
    total,
    page,
    pageCount: Math.ceil(total / DOCUMENTS_PAGE_SIZE),
  }
}

/** Every document raised against one order, newest first. */
export async function listOrderDocuments(orderId: string): Promise<InvoiceRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export type DocumentDetail = {
  invoice: InvoiceRow
  lines: InvoiceLineRow[]
  company: CompanyRow | null
  /** Primary contact on that company — the buyer block prints their phone. */
  contact: ContactRow | null
  order: OrderRow | null
  /**
   * Live settings, used only while the document is a draft. Once issued, the
   * printed document reads `invoice.supplier_snapshot` instead — an invoice
   * must not change because someone edited the company details afterwards.
   */
  settings: CompanySettingsRow | null
}

export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const supabase = await createClient()

  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
  if (!invoice) return null

  const [linesRes, companyRes, contactRes, orderRes, settings] = await Promise.all([
    supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', id)
      .order('line_no', { ascending: true }),
    supabase.from('companies').select('*').eq('id', invoice.company_id).maybeSingle(),
    // Same ordering `issue_document()` uses to pick the contact it snapshots,
    // so the draft preview shows the person the issued document will name.
    supabase
      .from('contacts')
      .select('*')
      .eq('company_id', invoice.company_id)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    invoice.order_id
      ? supabase.from('orders').select('*').eq('id', invoice.order_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getCompanySettings(),
  ])

  return {
    invoice,
    lines: linesRes.data ?? [],
    company: companyRes.data ?? null,
    contact: contactRes.data ?? null,
    order: orderRes.data ?? null,
    settings,
  }
}

/** Issued tax invoices on an order, for a credit or debit note to reference. */
export async function issuedTaxInvoices(orderId: string): Promise<InvoiceRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .eq('doc_type', 'tax_invoice')
    .eq('status', 'issued')
    .order('doc_date', { ascending: false })
  return data ?? []
}

/**
 * Every statutory number that is not a live document.
 *
 * Two different things, which the panel must never blur together. A
 * `cancelled` number is ordinary bookkeeping: it is reported as cancelled and
 * never reused. A `missing` one means the counter handed out a number that no
 * document row accounts for at all, which should not be possible and points at
 * something removed from underneath the series.
 *
 * The function refuses a non-admin outright, so this returns nothing rather
 * than a partial answer if it is ever called from the wrong page.
 */
export async function getNumberRegister(): Promise<DocumentNumberRegisterRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('document_number_register')
  if (error) return []
  return (data ?? []) as DocumentNumberRegisterRow[]
}
