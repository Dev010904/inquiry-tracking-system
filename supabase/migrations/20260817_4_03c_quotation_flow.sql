-- Phase 4, part 2 (c of c) — the quotation workflow, plus two corrections.
--
-- CORRECTION 1 — `20260817_4_03b` ended with
--   revoke all on function public.issue_document(uuid) from anon, authenticated;
-- which was wrong twice over. `issue_document` is called by the application
-- over RPC, so `authenticated` MUST hold EXECUTE; and it was never on the
-- restricted list in `20260813_restrict_internal_document_helpers.sql`, which
-- deliberately covered only the three helpers nothing in the app calls. The
-- grant is restored here.
--
-- CORRECTION 2 — a revoke aimed only at anon and authenticated leaves PUBLIC's
-- default EXECUTE in place, exactly as that earlier migration warned. The
-- quotation allocator is re-revoked from `public` as well, so a signed-in user
-- cannot burn quotation numbers over the REST API.

grant execute on function public.issue_document(uuid) to authenticated;

revoke all on function public.allocate_quotation_number(date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Documents must carry each line's own GST rate
-- ---------------------------------------------------------------------------
-- `create_document` copied every order line onto the document at the single
-- company default rate. That was correct while GST was one rate for everything.
-- Since Part 1 it is not: an order with 5%, 18% and 28% lines would have been
-- flattened to 18% across the board, producing a document that disagreed with
-- the order it was raised from. The rate and the zero-rate reason now travel
-- with the line.
create or replace function public.create_document(
  p_order_id uuid,
  p_doc_type public.document_type,
  p_doc_date date default current_date,
  p_place_of_supply_code text default null,
  p_place_of_supply_name text default null,
  p_parent_invoice_id uuid default null,
  p_notes text default null,
  p_reason text default null
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
  new_id uuid;
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
  if p_doc_type = 'quotation' then
    raise exception 'A quotation is raised against an inquiry. Use create_quotation().';
  end if;

  insert into public.invoices (
    doc_type, order_id, company_id, parent_invoice_id, doc_date,
    place_of_supply_code, place_of_supply_name, notes, reason, created_by
  ) values (
    p_doc_type, p_order_id, comp.id, p_parent_invoice_id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, p_reason, auth.uid()
  ) returning id into new_id;

  insert into public.invoice_lines (
    invoice_id, line_no, description, hsn_sac, quantity, unit, rate,
    taxable_value, gst_rate, zero_rate_reason, line_total
  )
  select new_id, i.line_no, i.description, i.hsn_sac, i.quantity, i.unit, i.rate,
         i.amount,
         -- A document that carries no tax zeroes the rate; everything else
         -- keeps the rate the order line was actually priced at.
         case when public.doc_type_shows_tax(p_doc_type) then i.gst_rate else 0 end,
         case when public.doc_type_shows_tax(p_doc_type) then i.zero_rate_reason else null end,
         i.amount
    from public.order_items i
   where i.order_id = p_order_id and i.deleted_at is null
   order by i.line_no;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

revoke all on function public.create_document(uuid, public.document_type, date, text, text, uuid, text, text)
  from public, anon;
grant execute on function public.create_document(uuid, public.document_type, date, text, text, uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Raising a quotation
-- ---------------------------------------------------------------------------
-- A quotation is raised before there is an order, so there are no order lines
-- to copy. It starts empty and its lines are typed on the draft — which is
-- also what makes them worth carrying into the order later.
create or replace function public.create_quotation(
  p_inquiry_id uuid,
  p_doc_date date default current_date,
  p_place_of_supply_code text default null,
  p_place_of_supply_name text default null,
  p_notes text default null
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
  new_id uuid;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into inq from public.inquiries where id = p_inquiry_id and deleted_at is null;
  if not found then raise exception 'That inquiry no longer exists.'; end if;

  select * into comp from public.companies where id = inq.company_id;

  insert into public.invoices (
    doc_type, inquiry_id, company_id, doc_date,
    place_of_supply_code, place_of_supply_name, notes, created_by
  ) values (
    'quotation', p_inquiry_id, comp.id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, auth.uid()
  ) returning id into new_id;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

revoke all on function public.create_quotation(uuid, date, text, text, text) from public, anon;
grant execute on function public.create_quotation(uuid, date, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Recomputing a draft after its lines are edited
-- ---------------------------------------------------------------------------
-- `recompute_document_totals` stays revoked from the API — calling it on an
-- issued document would rewrite a frozen tax record. This is the narrow way in:
-- an active member, a draft only, nothing else.
create or replace function public.refresh_document_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status public.document_status;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select status into v_status from public.invoices where id = p_invoice_id;
  if v_status is null then raise exception 'Document not found'; end if;
  if v_status <> 'draft' then
    raise exception 'An issued document cannot be recalculated.';
  end if;

  perform public.recompute_document_totals(p_invoice_id);
end $function$;

revoke all on function public.refresh_document_totals(uuid) from public, anon;
grant execute on function public.refresh_document_totals(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Accepting a quotation
-- ---------------------------------------------------------------------------
-- The lines the client agreed to become the order's lines, so nobody retypes
-- them and the order cannot quietly differ from what was quoted.
--
-- Order first, inquiry status second — the same ordering the existing convert
-- flow uses. `orders.inquiry_id` is unique, so a double submit fails on the
-- constraint rather than creating two orders, and a failure after the order
-- exists leaves a visible, fixable state rather than a confirmed inquiry with
-- no order behind it.
create or replace function public.accept_quotation(
  p_quotation_id uuid,
  p_technical_specification text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  q public.invoices;
  new_order_id uuid;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into q from public.invoices where id = p_quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  if q.doc_type <> 'quotation' then raise exception 'That document is not a quotation.'; end if;
  if q.status <> 'issued' then
    raise exception 'Only an issued quotation can be accepted.';
  end if;
  if q.inquiry_id is null then raise exception 'This quotation has no inquiry behind it.'; end if;

  if exists (select 1 from public.orders where inquiry_id = q.inquiry_id and deleted_at is null) then
    raise exception 'That inquiry already has an order.';
  end if;

  -- Zero to begin with: the lines below set the real value through
  -- `recalc_order_value()`, so no total is ever typed.
  insert into public.orders (inquiry_id, order_value, technical_specification, created_by)
  values (q.inquiry_id, 0, p_technical_specification, auth.uid())
  returning id into new_order_id;

  insert into public.order_items (
    order_id, line_no, description, hsn_sac, quantity, unit, rate,
    gst_rate, zero_rate_reason, created_by
  )
  select new_order_id, l.line_no, l.description, l.hsn_sac, l.quantity, l.unit, l.rate,
         l.gst_rate, l.zero_rate_reason, auth.uid()
    from public.invoice_lines l
   where l.invoice_id = p_quotation_id
   order by l.line_no;

  update public.inquiries set status = 'confirmed' where id = q.inquiry_id;

  return new_order_id;
end $function$;

revoke all on function public.accept_quotation(uuid, text) from public, anon;
grant execute on function public.accept_quotation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--   select has_function_privilege('authenticated','public.issue_document(uuid)','execute');
--     -- must be true, or nobody can issue a document
--   select has_function_privilege('authenticated','public.allocate_quotation_number(date)','execute');
--     -- must be false
