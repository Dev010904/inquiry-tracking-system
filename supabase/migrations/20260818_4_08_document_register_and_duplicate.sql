-- Phase 4, part 8 — the document lifecycle the owner actually needs.
--
-- He asked for two things that cannot be built: an issued invoice that stays
-- editable, and an issued invoice that can be deleted outright. Rule 46(b) of
-- the CGST Rules requires a consecutive serial number unique to the financial
-- year, and Section 36 requires the record be kept for 72 months. Deleting an
-- issued invoice destroys a record he is obliged to hold; editing one rewrites
-- a document the customer already has and that may already sit in a filed
-- GSTR-1, against which their input tax credit is matched.
--
-- What he wants is already reachable: a draft is freely editable and freely
-- deletable, and after issue the answers are Cancel and a credit or debit note.
-- This migration closes the two real gaps — being able to raise a replacement
-- quickly, and being able to see the state of the series without waiting for
-- filing day.
--
-- Before:
--   select count(*) from public.invoices where status = 'cancelled';
--   select * from public.document_counters;
-- After: document_number_register() returns one row per cancelled number and
--   one per genuine gap, and nothing else changes.

-- ---------------------------------------------------------------------------
-- 1. Record who cancelled a document
-- ---------------------------------------------------------------------------
-- cancelled_at and cancel_reason were already kept; the person was not, and
-- the register has to name them. Existing cancelled rows keep a null here —
-- the actor is still recoverable from activity_log for those.
alter table public.invoices
  add column if not exists cancelled_by uuid references public.profiles(id);

comment on column public.invoices.cancelled_by is
  'Who cancelled this document. Null for rows cancelled before this column existed.';

-- guard_issued_document permits the cancellation path only while doc_no,
-- grand_total and taxable_value are untouched. cancelled_by is none of those,
-- so this update stays inside the exception the guard already allows.
create or replace function public.cancel_document(p_invoice_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can cancel a document.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required to cancel a document.'; end if;

  update public.invoices
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = p_reason,
         cancelled_by = auth.uid()
   where id = p_invoice_id and status in ('draft','issued');

  if not found then raise exception 'That document cannot be cancelled.'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Duplicate a document into a fresh draft
-- ---------------------------------------------------------------------------
-- This is the honest answer to "let me edit an issued invoice". Something was
-- wrong with it, so raise the replacement in one action and credit the
-- original — rather than rewriting a document that has already gone out.
--
-- The lines are copied from the SOURCE DOCUMENT and not from the order. A
-- draft's lines can be edited away from the order it came from, and the point
-- of duplicating is to start from what is actually on this document.
create or replace function public.duplicate_document(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  src public.invoices;
  new_id uuid;
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;

  select * into src from public.invoices where id = p_invoice_id;
  if not found then raise exception 'That document no longer exists.'; end if;

  -- Everything that identifies the document in the series is deliberately left
  -- behind: no number, no financial year, no snapshots, no issue or cancel
  -- history. What comes back is a draft, and it takes its own number only if
  -- and when somebody issues it.
  insert into public.invoices (
    doc_type, status, order_id, inquiry_id, company_id, parent_invoice_id,
    doc_date, place_of_supply_code, place_of_supply_name, reverse_charge,
    notes, terms, created_by
  ) values (
    src.doc_type, 'draft', src.order_id, src.inquiry_id, src.company_id,
    src.parent_invoice_id, current_date, src.place_of_supply_code,
    src.place_of_supply_name, src.reverse_charge, src.notes, src.terms, auth.uid()
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
end $$;

revoke all on function public.duplicate_document(uuid) from public, anon;
grant execute on function public.duplicate_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The state of the statutory series
-- ---------------------------------------------------------------------------
-- Two different things, which must not be confused with each other.
--
-- 'cancelled' — a number that was issued and then cancelled. This is normal
--   and expected. It is reported as cancelled in GSTR-1 and it is never
--   reused: reusing it would put two different documents under one number for
--   the life of the business, which is far worse than the gap it closes.
--
-- 'missing'  — a number the counter has handed out for which no document row
--   exists at all, in any status. That should be impossible and means
--   something was deleted underneath the series. It is a real problem and has
--   to read differently from a routine cancellation.
--
-- Quotations are excluded throughout: they run on their own sequence, which is
-- explicitly allowed to have gaps and carries no statutory meaning.
create or replace function public.document_number_register()
returns table (
  kind          text,
  doc_type      public.document_type,
  fy            text,
  seq_number    integer,
  doc_no        text,
  doc_date      date,
  company_name  text,
  cancelled_at  timestamptz,
  cancelled_by_name text,
  cancel_reason text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'Not permitted'; end if;

  return query
  -- Cancelled documents keep their number, date and totals; only the status
  -- moved. Reading them straight off invoices is what makes the panel true.
  select 'cancelled'::text,
         i.doc_type, i.fy, i.seq_number, i.doc_no, i.doc_date,
         c.name,
         i.cancelled_at,
         p.full_name,
         i.cancel_reason
    from public.invoices i
    left join public.companies c on c.id = i.company_id
    left join public.profiles  p on p.id = i.cancelled_by
   where i.status = 'cancelled'
     and i.doc_no is not null
     and i.doc_type <> 'quotation'

  union all

  -- Every number the counter has issued, minus every number a row accounts
  -- for. generate_series walks 1..last_number per series per year.
  select 'missing'::text,
         dc.doc_type, dc.fy, g.n,
         coalesce(ds.prefix, dc.doc_type::text) || '/' || dc.fy || '/' || lpad(g.n::text, 4, '0'),
         null::date, null::text, null::timestamptz, null::text, null::text
    from public.document_counters dc
    cross join lateral generate_series(1, dc.last_number) as g(n)
    left join public.document_series ds on ds.doc_type = dc.doc_type
   where dc.doc_type <> 'quotation'
     and not exists (
       select 1 from public.invoices i
        where i.doc_type = dc.doc_type
          and i.fy = dc.fy
          and i.seq_number = g.n
     )

  order by 2, 3, 4;
end $$;

revoke all on function public.document_number_register() from public, anon;
grant execute on function public.document_number_register() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Payment terms on the document (added later the same day, at the owner's
--    request: a credit period under the date, defaulting to 15 days)
-- ---------------------------------------------------------------------------
-- company_settings already holds a free-text payment_terms line printed near
-- the foot of the page. This is a different thing: a number of days, per
-- document, printed beside the date where a customer looks for it, because the
-- credit period is negotiated per customer rather than fixed for the business.
alter table public.invoices
  add column if not exists payment_due_days integer not null default 15
  constraint invoices_payment_due_days_sane check (payment_due_days between 0 and 365);

comment on column public.invoices.payment_due_days is
  'Credit period printed on the document, in days. Defaults to 15 and is editable while the document is a draft.';

-- create_document gains p_payment_due_days with the same default. The previous
-- eight-argument signature is DROPPED rather than left in place: two overloads
-- differing only by a defaulted trailing parameter make an eight-argument call
-- ambiguous, and PostgREST resolves by named arguments.
--   drop function public.create_document(uuid, document_type, date, text, text, uuid, text, text);
-- See the deployed definition for the full body; only the new parameter, the
-- new insert column and this drop differ from section 2 of the file above.

-- Changing it after the draft exists. guard_issued_document already refuses any
-- update to an issued row; the status test here is what turns that into a
-- readable message rather than a constraint violation.
create or replace function public.set_payment_due_days(p_invoice_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_active_member() then raise exception 'Not permitted'; end if;
  if p_days is null or p_days < 0 or p_days > 365 then
    raise exception 'Payment terms must be between 0 and 365 days.';
  end if;

  update public.invoices
     set payment_due_days = p_days
   where id = p_invoice_id and status = 'draft';

  if not found then
    raise exception 'Payment terms can only be changed while the document is a draft.';
  end if;
end $$;

revoke all on function public.set_payment_due_days(uuid, integer) from public, anon;
grant execute on function public.set_payment_due_days(uuid, integer) to authenticated;
