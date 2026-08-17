-- Phase 4, part 2 (b of b) — quotations, and the fields the printed documents
-- need. Apply `20260817_4_03a_quotation_enum.sql` first.
--
-- A quotation is not a tax document, but it prints tax. That distinction runs
-- through this whole file:
--   * `doc_type_is_taxable()` is UNCHANGED. It governs the statutory rules —
--     gapless numbering, mandatory GSTIN, mandatory HSN, place of supply — and
--     RLS and the application both lean on it. A quotation must stay outside it.
--   * `doc_type_shows_tax()` is new, and governs only whether tax is CALCULATED
--     for display. Quotation joins the taxable types here and nowhere else.
-- Collapsing the two would either make a quotation a tax document or make it
-- print a zero-tax total, and both are wrong.

-- ---------------------------------------------------------------------------
-- 1. Whether a document displays tax, as distinct from being a tax document
-- ---------------------------------------------------------------------------
create or replace function public.doc_type_shows_tax(t public.document_type)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select public.doc_type_is_taxable(t) or t = 'quotation';
$$;

-- ---------------------------------------------------------------------------
-- 2. A quotation hangs off an inquiry, not an order
-- ---------------------------------------------------------------------------
-- It goes out before anything is confirmed, so there is no order to point at.
alter table public.invoices
  add column if not exists inquiry_id uuid references public.inquiries(id);

create index if not exists invoices_inquiry_idx on public.invoices (inquiry_id);

alter table public.invoices drop constraint if exists invoices_quotation_parent;
alter table public.invoices add constraint invoices_quotation_parent
  check (doc_type <> 'quotation' or order_id is not null or inquiry_id is not null);

-- Only a quotation may hang off an inquiry. Anything else reaching a company
-- through an inquiry rather than an order would quietly bypass the order's
-- money, which is what every other document type is built on.
alter table public.invoices drop constraint if exists invoices_inquiry_only_quotation;
alter table public.invoices add constraint invoices_inquiry_only_quotation
  check (inquiry_id is null or doc_type = 'quotation');

-- ---------------------------------------------------------------------------
-- 3. The document's own fields
-- ---------------------------------------------------------------------------
-- The supplied format prints two separate lines in words: the grand total and,
-- below it, the tax alone.
alter table public.invoices
  add column if not exists tax_amount_in_words text;

alter table public.company_settings
  add column if not exists msme_no text,
  add column if not exists jurisdiction_city text,
  add column if not exists payment_terms text,
  add column if not exists delivery_timeline text,
  add column if not exists quotation_terms text;

-- ---------------------------------------------------------------------------
-- 4. Words, in the form the printed document uses
-- ---------------------------------------------------------------------------
-- The supplied format writes "INR. Sixty Three Thousand ... Only." where
-- `amount_in_words()` returns "Rupees ... Only". The number-to-words logic is
-- reused rather than reimplemented; only the currency word and the closing full
-- stop differ, so this rewrites the prefix instead of duplicating the helper.
--
-- The sample's two words lines disagree with its own totals — it is a reused
-- template with typed text left behind. Nothing here is ever typed: both lines
-- are derived from the stored totals every time they are recomputed.
create or replace function public.document_amount_words(amt numeric)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select regexp_replace(public.amount_in_words(amt), '^Rupees ', 'INR. ') || '.';
$$;

-- ---------------------------------------------------------------------------
-- 5. Totals: unchanged arithmetic, two additions
-- ---------------------------------------------------------------------------
-- This function was already correct — it already rounded each line and summed,
-- and already chose CGST/SGST vs IGST per line at that line's own rate. The
-- only changes are the display predicate and the tax-in-words line. The
-- rounding and the per-line grouping are deliberately left exactly as they were.
create or replace function public.recompute_document_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  inv public.invoices;
  supplier_state text;
  intra boolean;
  taxable numeric(14,2);
  c numeric(14,2); s numeric(14,2); i numeric(14,2);
  gross numeric(14,2); rounded numeric(14,2);
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Document not found'; end if;

  select state_code into supplier_state from public.company_settings where singleton;
  intra := supplier_state is not null
       and inv.place_of_supply_code is not null
       and supplier_state = inv.place_of_supply_code;

  -- `doc_type_shows_tax`, not `doc_type_is_taxable`: a quotation prints tax
  -- without being a tax document. A delivery challan and a bill of supply
  -- still fall to the else branch and carry no tax at all.
  if public.doc_type_shows_tax(inv.doc_type) then
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
    into taxable, c, s, i
    from public.invoice_lines where invoice_id = p_invoice_id;

  gross := taxable + c + s + i;
  rounded := round(gross);

  update public.invoices
     set taxable_value = taxable,
         cgst_amount = c, sgst_amount = s, igst_amount = i,
         total_tax = c + s + i,
         round_off = rounded - gross,
         grand_total = rounded,
         amount_in_words = public.document_amount_words(rounded),
         -- Null rather than "INR. Zero Only." on a document that carries no
         -- tax: a challan must show no tax line at all, and an empty column is
         -- easier for the layout to honour than a zero it has to suppress.
         tax_amount_in_words = case when c + s + i > 0
                                    then public.document_amount_words(c + s + i)
                                    else null end
   where id = p_invoice_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quotation numbering — a separate, deliberately gappy series
-- ---------------------------------------------------------------------------
-- Statutory documents use `document_counters`, a locked counter that cannot
-- skip. A quotation is not statutory: quotes get withdrawn, and a hole in the
-- run is normal and harmless. A plain sequence is therefore the right tool,
-- and it must never share the counter that the tax series depends on.
create sequence if not exists public.quotation_no_seq as integer start 1;

insert into public.document_series (doc_type, prefix, next_number)
values ('quotation', 'QT', 1)
on conflict (doc_type) do nothing;

create or replace function public.allocate_quotation_number(p_date date)
returns table(out_fy text, out_seq integer, out_doc_no text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fy text := public.fy_label(p_date);
  v_prefix text;
  v_next int;
begin
  select prefix into v_prefix from public.document_series where doc_type = 'quotation';
  v_prefix := coalesce(v_prefix, 'QT');

  -- nextval, not a locked counter: a rolled-back quotation leaves a gap on
  -- purpose. Nothing downstream may assume this series is unbroken.
  v_next := nextval('public.quotation_no_seq');

  out_fy := v_fy;
  out_seq := v_next;
  out_doc_no := v_prefix || '/' || v_fy || '/' || lpad(v_next::text, 4, '0');
  return next;
end $$;

revoke all on function public.allocate_quotation_number(date) from anon, authenticated;

-- The statutory allocator now refuses a quotation outright. The call site in
-- `issue_document` already branches, so this can only fire if someone later
-- wires a quotation into the gapless series by mistake — which is exactly when
-- it should fail loudly rather than silently consuming a tax-invoice number.
create or replace function public.allocate_document_number(p_doc_type public.document_type, p_date date)
returns table(out_fy text, out_seq integer, out_doc_no text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fy text := public.fy_label(p_date);
  v_prefix text;
  v_next int;
begin
  if p_doc_type = 'quotation' then
    raise exception 'Quotations do not use the gapless series. Use allocate_quotation_number().';
  end if;

  select prefix into v_prefix from public.document_series where doc_type = p_doc_type;
  if v_prefix is null then raise exception 'No series configured for %', p_doc_type; end if;

  insert into public.document_counters as dc (doc_type, fy, last_number)
  values (p_doc_type, v_fy, 0)
  on conflict (doc_type, fy) do nothing;

  update public.document_counters as dc
     set last_number = dc.last_number + 1
   where dc.doc_type = p_doc_type and dc.fy = v_fy
  returning dc.last_number into v_next;

  out_fy := v_fy;
  out_seq := v_next;
  out_doc_no := v_prefix || '/' || v_fy || '/' || lpad(v_next::text, 4, '0');
  return next;
end $$;

revoke all on function public.allocate_document_number(public.document_type, date) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Issuing
-- ---------------------------------------------------------------------------
-- Unchanged for every existing document type. What is new: the quotation
-- branch, the quotation's own terms, and a buyer snapshot that also carries the
-- contact's name and phone — the supplied format prints them, and they live on
-- `contacts`, which the old snapshot never read.
create or replace function public.issue_document(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  inv public.invoices;
  cs  public.company_settings;
  comp public.companies;
  con public.contacts;
  alloc record;
  missing text[] := '{}';
  n int;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Document not found'; end if;
  if inv.status <> 'draft' then raise exception 'Only a draft can be issued.'; end if;

  select * into cs from public.company_settings where singleton;
  select * into comp from public.companies where id = inv.company_id;

  -- Whoever the document is addressed to. Primary contact first, oldest as a
  -- tiebreak, so the choice is stable rather than whatever the planner returns.
  select * into con from public.contacts
   where company_id = inv.company_id and deleted_at is null
   order by is_primary desc, created_at
   limit 1;

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

  if inv.doc_type = 'quotation' then
    select * into alloc from public.allocate_quotation_number(inv.doc_date);
  else
    select * into alloc from public.allocate_document_number(inv.doc_type, inv.doc_date);
  end if;

  update public.invoices set
    status = 'issued',
    fy = alloc.out_fy,
    seq_number = alloc.out_seq,
    doc_no = alloc.out_doc_no,
    issued_at = now(),
    issued_by = auth.uid(),
    terms = coalesce(inv.terms,
                     case when inv.doc_type = 'quotation' then cs.quotation_terms
                          else cs.invoice_terms end),
    supplier_snapshot = to_jsonb(cs) - 'created_at' - 'updated_at' - 'singleton',
    buyer_snapshot = jsonb_build_object(
      'name', comp.name, 'address', comp.address, 'city', comp.city,
      'state', comp.state, 'gstin', comp.gstin,
      'gst_applicable', comp.gst_applicable,
      'contact_name', con.name, 'contact_phone', con.phone
    )
  where id = p_invoice_id;

  return alloc.out_doc_no;
end $$;

revoke all on function public.issue_document(uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--   select public.doc_type_is_taxable('quotation');  -- must stay false
--   select public.doc_type_shows_tax('quotation');   -- must be true
--   select public.allocate_document_number('quotation', current_date); -- must raise
--   select public.document_amount_words(29559);
-- The orders fingerprint is untouched by this file; nothing here writes to
-- `orders`. Re-check it anyway:
--   35ea75e07ba27240dd47156ea431f328
