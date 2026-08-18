-- Gapless inquiry and order numbering.
--
-- NOT YET APPLIED. Written at the end of the first Phase 5 session, after the
-- owner reported a gap in the inquiry numbers. Apply it at the start of the
-- next session, with the before/after queries below.
--
-- ---------------------------------------------------------------------------
-- The fault
-- ---------------------------------------------------------------------------
-- The owner reported numbering running 1, 3, 4, 5 with 2 missing. Confirmed
-- live: INQ-2026-0002 does not exist and never did. Every other series is
-- contiguous.
--
-- gen_inquiry_no() and gen_order_no() take their counter from
-- nextval('inquiry_no_seq') / nextval('order_no_seq') in a BEFORE INSERT
-- trigger. A Postgres sequence is deliberately non-transactional: nextval()
-- is not rolled back. So any insert that fires the trigger and then fails —
-- a constraint, an RLS refusal, a rolled-back transaction, an application
-- error between the trigger and the commit — burns that number for good.
--
-- Statutory documents were never exposed to this. They allocate from
-- `document_counters`, an ordinary table whose UPDATE rolls back with the
-- transaction that failed. This migration gives inquiries and orders the
-- same treatment.
--
-- ---------------------------------------------------------------------------
-- The second fault, found while reading the first
-- ---------------------------------------------------------------------------
-- The year in the number comes from the record's own date —
-- to_char(inquiry_date,'YYYY') — but the counter is one global sequence that
-- never resets. So on 1 January 2027 the next inquiry becomes INQ-2027-0009,
-- not INQ-2027-0001, and an inquiry back-dated into 2025 would take a 2025
-- prefix with a number drawn from the same single pool. The year label and
-- the counter are currently unrelated to each other.
--
-- The counter below is keyed by (kind, year), so the number restarts with the
-- year it is labelled with, the way the document series already does.
--
-- ---------------------------------------------------------------------------
-- What this does NOT do
-- ---------------------------------------------------------------------------
-- It does not renumber anything. INQ-2026-0002 stays missing: those numbers
-- are on records staff have already referred to in email and on paper, and
-- renumbering to close a historical gap would be worse than the gap. The
-- counters are seeded from the highest number already issued in each year, so
-- the next inquiry is INQ-2026-0009 exactly as it would have been.
--
-- Run BEFORE applying, and keep the output:
--
--   select 'inquiry' k, inquiry_no n from inquiries
--   union all select 'order', order_no from orders order by k, n;
--
--   select sequencename, last_value from pg_sequences
--    where schemaname='public' and sequencename in ('inquiry_no_seq','order_no_seq');

begin;

create table if not exists public.record_counters (
  kind        text    not null check (kind in ('inquiry', 'order')),
  year        integer not null,
  last_number integer not null default 0,
  primary key (kind, year)
);

alter table public.record_counters enable row level security;

-- Read-only to admins, and written only by the SECURITY DEFINER trigger
-- functions below. Nobody edits a counter by hand through the API; that is
-- the whole point of moving off a sequence.
drop policy if exists record_counters_select on public.record_counters;
create policy record_counters_select on public.record_counters
  for select using (public.is_admin());

revoke all on public.record_counters from public, anon, authenticated;
grant select on public.record_counters to authenticated;

-- Seed from what has already been issued, per year, so nothing renumbers and
-- no number is handed out twice. right(no, 4) is the counter portion of
-- 'INQ-YYYY-NNNN'.
insert into public.record_counters (kind, year, last_number)
select 'inquiry',
       substring(inquiry_no from 5 for 4)::int,
       max(right(inquiry_no, 4)::int)
  from public.inquiries
 where inquiry_no ~ '^INQ-\d{4}-\d{4}$'
 group by 2
on conflict (kind, year) do update set last_number = greatest(
  public.record_counters.last_number, excluded.last_number);

insert into public.record_counters (kind, year, last_number)
select 'order',
       substring(order_no from 5 for 4)::int,
       max(right(order_no, 4)::int)
  from public.orders
 where order_no ~ '^ORD-\d{4}-\d{4}$'
 group by 2
on conflict (kind, year) do update set last_number = greatest(
  public.record_counters.last_number, excluded.last_number);

-- One allocator for both. The UPDATE takes a row lock, so two staff saving at
-- the same moment queue rather than collide, and a failure after this point
-- rolls the counter back with everything else.
create or replace function public.next_record_number(p_kind text, p_year integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_next integer;
begin
  insert into public.record_counters (kind, year, last_number)
  values (p_kind, p_year, 0)
  on conflict (kind, year) do nothing;

  update public.record_counters
     set last_number = last_number + 1
   where kind = p_kind and year = p_year
  returning last_number into v_next;

  return v_next;
end $$;

revoke all on function public.next_record_number(text, integer) from public, anon, authenticated;

create or replace function public.gen_inquiry_no()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year integer := extract(year from coalesce(new.inquiry_date, current_date))::int;
begin
  if new.inquiry_no is null then
    new.inquiry_no := 'INQ-' || v_year || '-'
                   || lpad(public.next_record_number('inquiry', v_year)::text, 4, '0');
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
  v_year integer := extract(year from coalesce(new.order_date, current_date))::int;
begin
  if new.order_no is null then
    new.order_no := 'ORD-' || v_year || '-'
                 || lpad(public.next_record_number('order', v_year)::text, 4, '0');
  end if;
  return new;
end $$;

commit;

-- The old sequences are deliberately left in place and no longer read. Drop
-- them only once a full financial year has passed with the counters in use;
-- until then they are the record of where the numbering had got to.
--
-- ---------------------------------------------------------------------------
-- Verification — run AFTER applying
-- ---------------------------------------------------------------------------
-- 1. Counters match what has been issued. Pass: one row per year, last_number
--    equal to the highest number in that year.
--
--   select * from public.record_counters order by kind, year;
--
-- 2. Nothing renumbered. Pass: identical to the BEFORE output above.
--
--   select 'inquiry' k, inquiry_no n from inquiries
--   union all select 'order', order_no from orders order by k, n;
--
-- 3. A failed insert no longer burns a number. Pass: the counter is unchanged
--    after the rollback, and the next real inquiry takes the number the failed
--    one would have taken.
--
--   begin;
--     select last_number from public.record_counters where kind='inquiry' and year=2026;
--     insert into public.inquiries (inquiry_date, company_id, requirement_summary, status, priority)
--     values (current_date, (select id from companies where deleted_at is null limit 1),
--             'ROLLBACK PROBE', 'new', 'medium');
--     select last_number from public.record_counters where kind='inquiry' and year=2026;
--   rollback;
--   select last_number from public.record_counters where kind='inquiry' and year=2026;
--
-- 4. Money untouched — this migration does not go near orders' figures, but
--    it does add a trigger function to `orders`, so run the row-by-row join in
--    README.md anyway. Pass: zero rows.
