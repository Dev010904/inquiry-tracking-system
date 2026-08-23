-- The house default for the installation line, and the end of the sentence
-- that used to carry it.
--
-- ---------------------------------------------------------------------------
-- Why this file exists at all
-- ---------------------------------------------------------------------------
-- 7_01 and 7_02 were written on the assumption that the site installation
-- sentence was hardcoded in the print layout. It was not. Reading a real issued
-- quotation on the deployed site showed where it actually comes from:
--
--   company_settings.quotation_terms
--     = 'Site Installation & visit charges @ Rs. 8000/- as extra. Total of 2 visits.'
--
-- issue_document() freezes that into invoices.terms, and the layout prints
-- invoices.terms in the same block as the new installation line. So with 7_01
-- and 7_02 alone, the next quotation issued would have printed the installation
-- line TWICE — once composed from the dropdown, once as leftover prose.
--
-- Two things follow, and both are done here.
--
-- ---------------------------------------------------------------------------
-- 1. The default moves from prose into fields
-- ---------------------------------------------------------------------------
-- Payment terms and the delivery timeline are already seeded onto each new
-- document from company_settings. The installation line should work the same
-- way, for the same reason: a document raised tomorrow must say what a document
-- raised yesterday said, unless somebody deliberately changes it.
--
-- Without this the sentence would simply vanish from new quotations until
-- somebody remembered to pick it from the dropdown — which is a silent change
-- to what goes out to customers, and the worst kind.
--
-- The seeded values are the ones parsed out of the sentence above: the scope,
-- Rs. 8000, and 2 visits. They remain editable per document.
--
-- ---------------------------------------------------------------------------
-- 2. The prose is cleared
-- ---------------------------------------------------------------------------
-- quotation_terms is emptied because its entire contents are that one sentence,
-- which is now held as data. This changes NOTHING already issued: every issued
-- document froze its own copy into invoices.terms at issue time, and
-- guard_issued_document() would refuse to alter it in any case. Verified before
-- writing this — the two issued quotations both carry the sentence in
-- invoices.terms already.
--
-- Run BEFORE, and keep the output:
--
--   select quotation_terms from company_settings;
--   select doc_no, status, terms from invoices order by created_at;

begin;

alter table public.company_settings
  add column if not exists default_installation_scope text,
  add column if not exists default_visit_rate         numeric(12,2),
  add column if not exists default_visit_count        integer;

comment on column public.company_settings.default_installation_scope is
  'Copied onto each new document, where it can be changed. The document keeps
   its own copy — editing this changes nothing already raised.';

-- The sentence, taken apart into the three things it was saying.
update public.company_settings
   set default_installation_scope = 'Site Installation & visit charges',
       default_visit_rate         = 8000,
       default_visit_count        = 2
 where singleton
   and default_installation_scope is null;

-- And now the prose it came from, which would otherwise print alongside it.
update public.company_settings
   set quotation_terms = null
 where singleton
   and btrim(coalesce(quotation_terms, ''))
       = 'Site Installation & visit charges @ Rs. 8000/- as extra. Total of 2 visits.';

-- ---------------------------------------------------------------------------
-- 3. Seed each new document from those defaults
-- ---------------------------------------------------------------------------
-- Only the INSERT changes in each of these. Every rule they carry — GST
-- applicability, note parentage, the quotation/order split — is exactly as
-- 7_02 left it.

create or replace function public.create_document(
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
    valid_days, payment_terms, delivery_timeline,
    installation_scope, visit_rate, visit_count
  ) values (
    p_doc_type, p_order_id, comp.id, p_parent_invoice_id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, p_reason, auth.uid(),
    coalesce(p_valid_days, 15),
    cs.payment_terms, cs.delivery_timeline,
    cs.default_installation_scope, cs.default_visit_rate, cs.default_visit_count
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

create or replace function public.create_quotation(
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
    valid_days, payment_terms, delivery_timeline,
    installation_scope, visit_rate, visit_count
  ) values (
    'quotation', p_inquiry_id, comp.id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, auth.uid(),
    coalesce(p_valid_days, 15), cs.payment_terms, cs.delivery_timeline,
    cs.default_installation_scope, cs.default_visit_rate, cs.default_visit_count
  ) returning id into new_id;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

commit;
