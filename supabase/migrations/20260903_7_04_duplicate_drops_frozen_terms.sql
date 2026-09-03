-- A duplicate must not carry the previous document's frozen terms.
--
-- invoices.terms is a snapshot: issue_document writes company_settings into it
-- and it is never touched again, which is what lets a reissued sheet reproduce
-- the words that actually went out.
--
-- duplicate_document copied that snapshot into the new draft. Because
-- issue_document then reads `coalesce(inv.terms, cs.invoice_terms)`, the
-- inherited copy always won, so every document duplicated from an old one was
-- pinned to whatever the terms said on the day the original was issued. There
-- is no field anywhere in the app for editing invoices.terms on a draft, so
-- once a chain of duplicates carried a sentence there was no way to change or
-- remove it: emptying "Terms and conditions" in Settings left it printing, and
-- rewriting it printed the old words.
--
-- Leaving terms null on the duplicate puts it back under the coalesce, so the
-- draft picks up whatever Settings says at the moment it is issued — empty
-- setting, no line; new wording, the new wording.
--
-- Only the copy is changed. No issued document's stored terms are touched, and
-- the column stays frozen once written.

create or replace function public.duplicate_document(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  src public.invoices;
  new_id uuid;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into src from public.invoices where id = p_invoice_id;
  if not found then raise exception 'That document no longer exists.'; end if;

  insert into public.invoices (
    doc_type, status, order_id, inquiry_id, company_id, parent_invoice_id,
    doc_date, place_of_supply_code, place_of_supply_name, reverse_charge,
    notes, created_by,
    valid_days, payment_terms, delivery_timeline,
    installation_scope, visit_rate, visit_count
  ) values (
    src.doc_type, 'draft', src.order_id, src.inquiry_id, src.company_id,
    src.parent_invoice_id, current_date, src.place_of_supply_code,
    src.place_of_supply_name, src.reverse_charge, src.notes, auth.uid(),
    src.valid_days, src.payment_terms, src.delivery_timeline,
    src.installation_scope, src.visit_rate, src.visit_count
  ) returning id into new_id;

  insert into public.invoice_lines (
    invoice_id, line_no, description, hsn_sac, quantity, unit, rate,
    taxable_value, gst_rate, zero_rate_reason, line_total
  )
  select new_id, l.line_no, l.description, l.hsn_sac, l.quantity, l.unit, l.rate,
         l.taxable_value, l.gst_rate, l.zero_rate_reason, l.line_total
    from public.invoice_lines l
   where l.invoice_id = p_invoice_id
   order by l.line_no;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;
