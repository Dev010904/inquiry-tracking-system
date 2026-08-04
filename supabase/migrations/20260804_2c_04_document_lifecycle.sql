-- Phase 2C, migration 4 of 4 — creating, issuing and cancelling documents.

-- Which document types carry tax. A proforma and a delivery challan are not
-- tax documents at all; a bill of supply is for clients outside GST.
create or replace function public.doc_type_is_taxable(t public.document_type)
returns boolean language sql immutable as $$
  select t in ('tax_invoice','credit_note','debit_note');
$$;

-- Recomputes every line's tax and the document totals from the supplier state
-- and the place of supply. Same state => CGST + SGST, otherwise IGST.
create or replace function public.recompute_document_totals(p_invoice_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  inv public.invoices; supplier_state text; intra boolean;
  taxable numeric(14,2); c numeric(14,2); s numeric(14,2); i numeric(14,2);
  gross numeric(14,2); rounded numeric(14,2);
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Document not found'; end if;

  select state_code into supplier_state from public.company_settings where singleton;
  intra := supplier_state is not null and inv.place_of_supply_code is not null
       and supplier_state = inv.place_of_supply_code;

  if public.doc_type_is_taxable(inv.doc_type) then
    update public.invoice_lines l
       set cgst_amount = case when intra then round(l.taxable_value * l.gst_rate / 200, 2) else 0 end,
           sgst_amount = case when intra then round(l.taxable_value * l.gst_rate / 200, 2) else 0 end,
           igst_amount = case when intra then 0 else round(l.taxable_value * l.gst_rate / 100, 2) end
     where l.invoice_id = p_invoice_id;
  else
    update public.invoice_lines l
       set gst_rate = 0, cgst_amount = 0, sgst_amount = 0, igst_amount = 0
     where l.invoice_id = p_invoice_id;
  end if;

  update public.invoice_lines l
     set line_total = l.taxable_value + l.cgst_amount + l.sgst_amount + l.igst_amount
   where l.invoice_id = p_invoice_id;

  select coalesce(sum(taxable_value),0), coalesce(sum(cgst_amount),0),
         coalesce(sum(sgst_amount),0), coalesce(sum(igst_amount),0)
    into taxable, c, s, i from public.invoice_lines where invoice_id = p_invoice_id;

  gross := taxable + c + s + i;
  rounded := round(gross);

  update public.invoices
     set taxable_value = taxable, cgst_amount = c, sgst_amount = s, igst_amount = i,
         total_tax = c + s + i, round_off = rounded - gross, grand_total = rounded,
         amount_in_words = public.amount_in_words(rounded)
   where id = p_invoice_id;
end $$;

-- Creates a draft document from an order, copying the current line items.
create or replace function public.create_document(
  p_order_id uuid,
  p_doc_type public.document_type,
  p_doc_date date default current_date,
  p_place_of_supply_code text default null,
  p_place_of_supply_name text default null,
  p_parent_invoice_id uuid default null,
  p_notes text default null,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  ord public.orders; comp public.companies; inq public.inquiries;
  new_id uuid; v_gst_rate numeric(5,2);
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into ord from public.orders where id = p_order_id and deleted_at is null;
  if not found then raise exception 'That order no longer exists.'; end if;

  select * into inq from public.inquiries where id = ord.inquiry_id;
  select * into comp from public.companies where id = inq.company_id;

  if public.doc_type_is_taxable(p_doc_type) and not comp.gst_applicable then
    raise exception 'This client is marked as not GST-applicable. Issue a bill of supply instead.';
  end if;
  if p_doc_type = 'bill_of_supply' and comp.gst_applicable then
    raise exception 'A bill of supply is only for clients marked as not GST-applicable.';
  end if;
  if p_doc_type in ('credit_note','debit_note') and p_parent_invoice_id is null then
    raise exception 'A credit or debit note must reference the invoice it corrects.';
  end if;

  select coalesce(default_gst_rate, 18) into v_gst_rate from public.company_settings where singleton;

  insert into public.invoices (
    doc_type, order_id, company_id, parent_invoice_id, doc_date,
    place_of_supply_code, place_of_supply_name, notes, reason, created_by
  ) values (
    p_doc_type, p_order_id, comp.id, p_parent_invoice_id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)),
    coalesce(p_place_of_supply_name, comp.state),
    p_notes, p_reason, auth.uid()
  ) returning id into new_id;

  insert into public.invoice_lines (
    invoice_id, line_no, description, hsn_sac, quantity, unit, rate,
    taxable_value, gst_rate, line_total
  )
  select new_id, i.line_no, i.description, i.hsn_sac, i.quantity, i.unit, i.rate, i.amount,
         case when public.doc_type_is_taxable(p_doc_type) then v_gst_rate else 0 end, i.amount
    from public.order_items i
   where i.order_id = p_order_id and i.deleted_at is null
   order by i.line_no;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $$;

-- Issues a draft: allocates the number and freezes the supplier and buyer
-- details onto the document. Everything printed later comes from these
-- snapshots, never from live records.
create or replace function public.issue_document(p_invoice_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  inv public.invoices; cs public.company_settings; comp public.companies;
  alloc record; missing text[] := '{}'; n int;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Document not found'; end if;
  if inv.status <> 'draft' then raise exception 'Only a draft can be issued.'; end if;

  select * into cs from public.company_settings where singleton;
  select * into comp from public.companies where id = inv.company_id;

  if coalesce(btrim(cs.legal_name), '') = '' then missing := missing || 'legal name'; end if;
  if coalesce(btrim(cs.address_line1), '') = '' then missing := missing || 'address'; end if;
  if coalesce(btrim(cs.state_code), '') = '' then missing := missing || 'state code'; end if;
  if public.doc_type_is_taxable(inv.doc_type) and coalesce(btrim(cs.gstin), '') = '' then
    missing := missing || 'GSTIN';
  end if;
  if array_length(missing, 1) is not null then
    raise exception 'Company & tax details are incomplete: % must be filled in under Settings before a document can be issued.',
      array_to_string(missing, ', ');
  end if;

  select count(*) into n from public.invoice_lines where invoice_id = p_invoice_id;
  if n = 0 then raise exception 'This document has no lines.'; end if;

  if public.doc_type_is_taxable(inv.doc_type) then
    select count(*) into n from public.invoice_lines
     where invoice_id = p_invoice_id and coalesce(btrim(hsn_sac), '') = '';
    if n > 0 then
      raise exception 'Every line needs an HSN/SAC code before a tax document can be issued. % line(s) are missing one.', n;
    end if;
    if coalesce(btrim(inv.place_of_supply_code), '') = '' then
      raise exception 'Place of supply is required on a tax document.';
    end if;
  end if;

  perform public.recompute_document_totals(p_invoice_id);
  select * into alloc from public.allocate_document_number(inv.doc_type, inv.doc_date);

  update public.invoices set
    status = 'issued', fy = alloc.out_fy, seq_number = alloc.out_seq, doc_no = alloc.out_doc_no,
    issued_at = now(), issued_by = auth.uid(),
    terms = coalesce(inv.terms, cs.invoice_terms),
    supplier_snapshot = to_jsonb(cs) - 'created_at' - 'updated_at' - 'singleton',
    buyer_snapshot = jsonb_build_object(
      'name', comp.name, 'address', comp.address, 'city', comp.city,
      'state', comp.state, 'gstin', comp.gstin, 'gst_applicable', comp.gst_applicable)
  where id = p_invoice_id;

  return alloc.out_doc_no;
end $$;

create or replace function public.cancel_document(p_invoice_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can cancel a document.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required to cancel a document.'; end if;

  update public.invoices
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
   where id = p_invoice_id and status in ('draft','issued');

  if not found then raise exception 'That document cannot be cancelled.'; end if;
end $$;
