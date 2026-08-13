import { redirect } from 'next/navigation'

/**
 * The section is called Invoices but lives at /documents, because it also
 * holds proformas, challans and notes. Anyone typing the name they can see in
 * the menu lands here, so send them on rather than showing a 404.
 */
export default function InvoicesRedirect() {
  redirect('/documents')
}
