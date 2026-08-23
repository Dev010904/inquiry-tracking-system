-- The calls behind the new document terms.
--
-- Applied after 20260823_7_01_document_terms_and_validity.sql, which added the
-- columns these functions write.
--
-- Every definition below was read out of the live database first and changed
-- only where it had to be — the folder README requires that, and create_document
-- in particular carries rules (GST applicability, note parentage) that must not
-- be lost to a rewrite from memory.

begin;

-- ---------------------------------------------------------------------------
-- 1. Raising a draft from an order
-- ---------------------------------------------------------------------------
-- The argument TYPES are unchanged, so this would be an in-place replacement —
-- but the last parameter is renamed, and PostgREST calls by name, so the old
-- name has to go rather than linger as a second overload.
drop function if exists public.create_document(uuid, document_type, date, text, text, uuid, text, text, integer);

create function public.create_document(
  p_order_id uuid,
  p_doc_type document_type,
  p_doc_date date default current_date,
  p_place_of_supply_code text default null,
  p_place_of_supply_name text default null,
  p_parent_invoice_id uuid default null,
  p_notes text default null,
  p_reason text default null,
  p_valid_days integer default 15
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  ord public.orders;
  comp public.companies;
  inq public.inquiries;
  cs public.company_settings;
  new_id uuid;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into ord from public.orders where id = p_order_id and deleted_at is null;
  if not found then raise exception 'That order no longer exists.'; end if;

  select * into inq from public.inquiries where id = ord.inquiry_id;
  select * into comp from public.companies where id = inq.company_id;
  select * into cs from public.company_settings where singleton;

  if public.doc_type_is_taxable(p_doc_type) and not comp.gst_applicable then
    raise exception 'This client is marked as not GST-applicable. Issue a bill of supply instead.';
  end if;
  if p_doc_type = 'bill_of_supply' and comp.gst_applicable then
    raise exception 'A bill of supply is only for clients marked as not GST-applicable.';
  end if;
  if p_doc_type in ('credit_note','debit_note') and p_parent_invoice_id is null then
    raise exception 'A credit or debit note must reference the invoice it corrects.';
  end if;
  if p_doc_type = 'quotation' then
    raise exception 'A quotation is raised against an inquiry. Use create_quotation().';
  end if;

  insert into public.invoices (
    doc_type, order_id, company_id, parent_invoice_id, doc_date,
    place_of_supply_code, place_of_supply_name, notes, reason, created_by,
    valid_days, payment_terms, delivery_timeline
  ) values (
    p_doc_type, p_order_id, comp.id, p_parent_invoice_id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, p_reason, auth.uid(),
    coalesce(p_valid_days, 15),
    -- The house default, copied onto the document so that changing Settings
    -- tomorrow cannot rewrite what this one says.
    cs.payment_terms, cs.delivery_timeline
  ) returning id into new_id;

  insert into public.invoice_lines (
    invoice_id, line_no, description, hsn_sac, quantity, unit, rate,
    taxable_value, gst_rate, zero_rate_reason, line_total
  )
  select new_id, i.line_no, i.description, i.hsn_sac, i.quantity, i.unit, i.rate,
         i.amount,
         case when public.doc_type_shows_tax(p_doc_type) then i.gst_rate else 0 end,
         case when public.doc_type_shows_tax(p_doc_type) then i.zero_rate_reason else null end,
         i.amount
    from public.order_items i
   where i.order_id = p_order_id and i.deleted_at is null
   order by i.line_no;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

revoke all on function public.create_document(uuid, document_type, date, text, text, uuid, text, text, integer) from public;
grant execute on function public.create_document(uuid, document_type, date, text, text, uuid, text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Raising a draft quotation from an inquiry
-- ---------------------------------------------------------------------------
-- Validity matters more here than anywhere: a quotation IS a price with an
-- expiry, and it was the one document type that could not carry one.
drop function if exists public.create_quotation(uuid, date, text, text, text);

create function public.create_quotation(
  p_inquiry_id uuid,
  p_doc_date date default current_date,
  p_place_of_supply_code text default null,
  p_place_of_supply_name text default null,
  p_notes text default null,
  p_valid_days integer default 15
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  inq public.inquiries;
  comp public.companies;
  cs public.company_settings;
  new_id uuid;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into inq from public.inquiries where id = p_inquiry_id and deleted_at is null;
  if not found then raise exception 'That inquiry no longer exists.'; end if;

  select * into comp from public.companies where id = inq.company_id;
  select * into cs from public.company_settings where singleton;

  insert into public.invoices (
    doc_type, inquiry_id, company_id, doc_date,
    place_of_supply_code, place_of_supply_name, notes, created_by,
    valid_days, payment_terms, delivery_timeline
  ) values (
    'quotation', p_inquiry_id, comp.id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, auth.uid(),
    coalesce(p_valid_days, 15), cs.payment_terms, cs.delivery_timeline
  ) returning id into new_id;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

revoke all on function public.create_quotation(uuid, date, text, text, text, integer) from public;
grant execute on function public.create_quotation(uuid, date, text, text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Editing the terms on a draft
-- ---------------------------------------------------------------------------
-- Replaces set_payment_due_days(), which could only ever change the one number.
-- One call rather than six: the panel saves the whole block at once, so a
-- half-saved set of terms is not a state the document can be left in.
drop function if exists public.set_payment_due_days(uuid, integer);

create function public.set_document_terms(
  p_invoice_id uuid,
  p_valid_days integer,
  p_payment_terms text default null,
  p_delivery_timeline text default null,
  p_installation_scope text default null,
  p_visit_rate numeric default null,
  p_visit_count integer default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  if p_valid_days is null or p_valid_days < 0 or p_valid_days > 365 then
    raise exception 'Validity must be between 0 and 365 days.';
  end if;
  if p_visit_rate is not null and p_visit_rate < 0 then
    raise exception 'A visit rate cannot be negative.';
  end if;
  if p_visit_count is not null and (p_visit_count < 0 or p_visit_count > 999) then
    raise exception 'The number of visits must be between 0 and 999.';
  end if;

  update public.invoices
     set valid_days         = p_valid_days,
         -- An empty box means "print nothing", which is null, not ''. Blanking
         -- a term has to be possible; otherwise the first sentence anyone types
         -- is stuck on the document for good.
         payment_terms      = nullif(btrim(coalesce(p_payment_terms, '')), ''),
         delivery_timeline  = nullif(btrim(coalesce(p_delivery_timeline, '')), ''),
         installation_scope = nullif(btrim(coalesce(p_installation_scope, '')), ''),
         visit_rate         = p_visit_rate,
         visit_count        = p_visit_count
   where id = p_invoice_id and status = 'draft';

  if not found then
    raise exception 'Terms can only be changed while the document is a draft.';
  end if;
end $function$;

revoke all on function public.set_document_terms(uuid, integer, text, text, text, numeric, integer) from public;
grant execute on function public.set_document_terms(uuid, integer, text, text, text, numeric, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Adding to the installation list without leaving the document
-- ---------------------------------------------------------------------------
-- Returns the label rather than the id, because the document stores the label.
-- Adding one that already exists returns the existing row instead of failing:
-- two people typing the same scope on the same afternoon is not an error worth
-- putting on anyone's screen.
create or replace function public.add_installation_option(p_label text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  clean text := btrim(coalesce(p_label, ''));
  out_label text;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;
  if clean = '' then raise exception 'Type the installation scope before adding it.'; end if;
  if length(clean) > 200 then raise exception 'That is too long for a dropdown entry.'; end if;

  insert into public.installation_options (label, created_by)
  values (clean, auth.uid())
  on conflict (label) do nothing;

  select label into out_label from public.installation_options where label = clean;
  return out_label;
end $function$;

revoke all on function public.add_installation_option(text) from public;
grant execute on function public.add_installation_option(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. A duplicate has to carry the terms too
-- ---------------------------------------------------------------------------
-- Duplicating exists so a wrong invoice can be reissued quickly. A copy that
-- silently dropped the negotiated payment terms would defeat that.
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
    notes, terms, created_by,
    valid_days, payment_terms, delivery_timeline,
    installation_scope, visit_rate, visit_count
  ) values (
    src.doc_type, 'draft', src.order_id, src.inquiry_id, src.company_id,
    src.parent_invoice_id, current_date, src.place_of_supply_code,
    src.place_of_supply_name, src.reverse_charge, src.notes, src.terms, auth.uid(),
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

commit;
