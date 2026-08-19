-- Every series restarts at 0001 on 1 April.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- The owner's instruction: on 1 April the whole system starts at 1. Before
-- this, three different things happened depending on the series:
--
--   * Statutory documents (tax invoice, challan, credit/debit note, proforma,
--     bill of supply) already restarted correctly. They allocate from
--     `document_counters`, keyed by (doc_type, fy_label(date)) — the counter
--     and the label printed on the paper are the same key, so they cannot
--     drift apart.
--
--   * Inquiries and orders restarted on 1 JANUARY, not 1 April. The previous
--     migration gave them a (kind, year) counter using the calendar year, and
--     the label in the number was the calendar year too. Consistent with
--     itself, but the wrong boundary for an Indian business.
--
--   * Quotations never restarted at all. allocate_quotation_number() took
--     nextval('quotation_no_seq'), a single global sequence, while printing
--     fy_label(date) beside it. On 1 April 2027 the first quotation of the new
--     year would have been QT/2027-28/0002 — a number that reads as though a
--     quotation had been issued and lost. It was also non-transactional, so a
--     failed issue burned a number the same way the inquiry series used to.
--
-- After this migration every series is keyed by the financial year it prints,
-- and every counter lives in an ordinary table whose UPDATE rolls back with
-- the transaction that failed.
--
-- ---------------------------------------------------------------------------
-- What this does NOT do
-- ---------------------------------------------------------------------------
-- Nothing is renumbered. Every record in the system is dated in FY 2026-27 and
-- already carries the label 2026, so the seeds below reproduce exactly the
-- numbers that have already been issued. Verified before writing this:
--
--   INQ-2026-0001, 0003..0008  all inquiry_date in Aug 2026  -> fy 2026-27
--   ORD-2026-0001, 0002        all order_date   in Aug 2026  -> fy 2026-27
--   QT/2026-27/0001            issued, then cancelled
--   INV/2026-27/0001           issued, then cancelled
--
-- The gap at INQ-2026-0002 stays. Those numbers are on paper already.
--
-- Run BEFORE, and keep the output:
--
--   select inquiry_no from inquiries order by 1;
--   select order_no   from orders    order by 1;
--   select * from record_counters;
--   select * from document_counters order by doc_type, fy;

-- ---------------------------------------------------------------------------
-- 1. record_counters moves from calendar year to financial year
-- ---------------------------------------------------------------------------

create table if not exists public.record_counters_fy (
  kind        text not null check (kind in ('inquiry', 'order')),
  fy          text not null,
  last_number integer not null default 0,
  primary key (kind, fy)
);

alter table public.record_counters_fy enable row level security;

drop policy if exists record_counters_fy_select on public.record_counters_fy;
create policy record_counters_fy_select on public.record_counters_fy
  for select using (public.is_admin());

revoke all on public.record_counters_fy from public, anon, authenticated;
grant select on public.record_counters_fy to authenticated;

-- Seed from what has actually been issued, grouped by the financial year of
-- the record's own date. right(no,4) is the counter portion of 'INQ-YYYY-NNNN'.
insert into public.record_counters_fy (kind, fy, last_number)
select 'inquiry', public.fy_label(inquiry_date), max(right(inquiry_no, 4)::int)
  from public.inquiries
 where inquiry_no ~ '^INQ-\d{4}-\d{4}$' and inquiry_date is not null
 group by 2
on conflict (kind, fy) do update
  set last_number = greatest(public.record_counters_fy.last_number, excluded.last_number);

insert into public.record_counters_fy (kind, fy, last_number)
select 'order', public.fy_label(order_date), max(right(order_no, 4)::int)
  from public.orders
 where order_no ~ '^ORD-\d{4}-\d{4}$' and order_date is not null
 group by 2
on conflict (kind, fy) do update
  set last_number = greatest(public.record_counters_fy.last_number, excluded.last_number);

-- ---------------------------------------------------------------------------
-- 2. One allocator, keyed by financial year
-- ---------------------------------------------------------------------------

-- The number prints the year the financial year STARTS in, so FY 2026-27 reads
-- INQ-2026-nnnn. An inquiry raised in February 2027 belongs to FY 2026-27 and
-- therefore continues that series rather than starting a 2027 one — which is
-- the whole point: the label and the counter are the same key.
create or replace function public.gen_inquiry_no()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fy text := public.fy_label(coalesce(new.inquiry_date, current_date));
begin
  if new.inquiry_no is null then
    new.inquiry_no := 'INQ-' || left(v_fy, 4) || '-'
                   || lpad(public.next_record_number('inquiry', v_fy)::text, 4, '0');
  end if;
  return new;
end $$;

create or replace function public.gen_order_no()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fy text := public.fy_label(coalesce(new.order_date, current_date));
begin
  if new.order_no is null then
    new.order_no := 'ORD-' || left(v_fy, 4) || '-'
                 || lpad(public.next_record_number('order', v_fy)::text, 4, '0');
  end if;
  return new;
end $$;

-- The old (kind, year) table is dropped only after the functions above stop
-- referring to it, so nothing can allocate from the calendar-year counter.
drop function if exists public.next_record_number(text, integer);
drop table if exists public.record_counters;

alter table public.record_counters_fy rename to record_counters;
alter policy record_counters_fy_select on public.record_counters
  rename to record_counters_select;

-- Created only now, and against the FINAL table name. plpgsql resolves table
-- names at run time, so a function written against record_counters_fy before
-- the rename raises "relation does not exist" on the first insert — which is
-- exactly what the rollback probe caught, before any staff hit it.
create or replace function public.next_record_number(p_kind text, p_fy text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next integer;
begin
  insert into public.record_counters (kind, fy, last_number)
  values (p_kind, p_fy, 0)
  on conflict (kind, fy) do nothing;

  -- The UPDATE takes a row lock, so two staff saving at the same moment queue
  -- rather than collide, and a failure after this point rolls the counter back
  -- with everything else.
  update public.record_counters
     set last_number = last_number + 1
   where kind = p_kind and fy = p_fy
  returning last_number into v_next;

  return v_next;
end $$;

revoke all on function public.next_record_number(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Quotations join the same scheme
-- ---------------------------------------------------------------------------
-- Seeded from the highest quotation number already issued in each financial
-- year, so the cancelled QT/2026-27/0001 keeps its number and the next
-- quotation is 0002 — exactly what would have happened anyway.
insert into public.document_counters (doc_type, fy, last_number)
select 'quotation', fy, max(seq_number)
  from public.invoices
 where doc_type = 'quotation' and fy is not null and seq_number is not null
 group by fy
on conflict (doc_type, fy) do update
  set last_number = greatest(public.document_counters.last_number, excluded.last_number);

create or replace function public.allocate_quotation_number(p_date date)
returns table(out_fy text, out_seq integer, out_doc_no text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fy text := public.fy_label(p_date);
  v_prefix text;
  v_next int;
begin
  select prefix into v_prefix from public.document_series where doc_type = 'quotation';
  v_prefix := coalesce(v_prefix, 'QT');

  -- document_counters rather than nextval('quotation_no_seq'): a table UPDATE
  -- rolls back with a failed issue, and the (doc_type, fy) key restarts the
  -- series on 1 April instead of running on for ever.
  insert into public.document_counters as dc (doc_type, fy, last_number)
  values ('quotation', v_fy, 0)
  on conflict (doc_type, fy) do nothing;

  update public.document_counters as dc
     set last_number = dc.last_number + 1
   where dc.doc_type = 'quotation' and dc.fy = v_fy
  returning dc.last_number into v_next;

  out_fy := v_fy;
  out_seq := v_next;
  out_doc_no := v_prefix || '/' || v_fy || '/' || lpad(v_next::text, 4, '0');
  return next;
end $function$;

-- quotation_no_seq, inquiry_no_seq and order_no_seq are deliberately left in
-- place and no longer read. They are the record of where each series had got
-- to before it moved off a sequence. Drop them only once a full financial year
-- has passed with the counters in use.

-- ---------------------------------------------------------------------------
-- Verification — run AFTER applying
-- ---------------------------------------------------------------------------
-- 1. Counters match what has been issued, keyed by financial year:
--
--   select * from record_counters order by kind, fy;
--   select * from document_counters order by doc_type, fy;
--
-- 2. Nothing renumbered — identical to the BEFORE output.
--
-- 3. The 1 April boundary. Pass: a 31-Mar-2027 record continues the 2026
--    series and a 1-Apr-2027 record starts 0001. Roll it back afterwards.
--
--   begin;
--     insert into inquiries (company_id, requirement_summary, status, priority, inquiry_date)
--     values ((select id from companies where deleted_at is null limit 1),
--             'FY PROBE', 'new', 'medium', date '2027-03-31') returning inquiry_no;
--     insert into inquiries (company_id, requirement_summary, status, priority, inquiry_date)
--     values ((select id from companies where deleted_at is null limit 1),
--             'FY PROBE', 'new', 'medium', date '2027-04-01') returning inquiry_no;
--   rollback;
--
-- 4. Money untouched — run the row-by-row join in README.md. Pass: zero rows.

-- ---------------------------------------------------------------------------
-- Measured after applying, every number rolled back afterwards
-- ---------------------------------------------------------------------------
--   inquiry 31-Mar-2027 -> INQ-2026-0009      order 31-Mar-2027 -> ORD-2026-0003
--   inquiry 01-Apr-2027 -> INQ-2027-0001      order 05-Apr-2027 -> ORD-2027-0001
--   inquiry 02-Apr-2027 -> INQ-2027-0002
--   quote   31-Mar-2027 -> QT/2026-27/0002
--   quote   01-Apr-2027 -> QT/2027-28/0001
--   quote   02-Apr-2027 -> QT/2027-28/0002
-- Counters unchanged afterwards: inquiry/2026-27=8, order/2026-27=2,
-- quotation/2026-27=1, tax_invoice/2026-27=1.
