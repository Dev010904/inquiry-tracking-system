-- Phase 4, part 1 — GST becomes a per-line rate.
--
-- ANK sells at 0/5/12/18/28 and needs mixed rates on one document. Until now
-- the rate was hardcoded at 18% in two Postgres GENERATED columns on `orders`,
-- so no amount of UI work could produce a correct mixed-rate document.
--
-- Read `20260817_4_00_pre_phase4_snapshot.sql` and run it first. This file
-- rewrites money columns on a live table and has no undo of its own.
--
-- What the live schema actually contained before this file, which is not what
-- the plan for this phase assumed:
--   * `order_items` had NO `gst_rate` column at all — it is added here.
--   * `invoice_lines.gst_rate` existed but defaulted to 0, not 18.
--   * `recompute_document_totals()` ALREADY rounded per line and summed, and
--     already decided CGST/SGST vs IGST per line at that line's own rate.
--     It is therefore left exactly as it is: it was never the bug.

-- ---------------------------------------------------------------------------
-- 1. Per-line rate on order lines
-- ---------------------------------------------------------------------------

-- Default 18 matches `company_settings.default_gst_rate` as it stands today.
-- The DB default is only a backstop for a direct insert; every line written by
-- the application carries an explicit rate, seeded from company settings at the
-- moment the line is added. A default that silently taxed a line the user meant
-- to zero-rate — or vice versa — would be worse than no default.
alter table public.order_items
  add column if not exists gst_rate numeric(5,2) not null default 18
    check (gst_rate >= 0 and gst_rate <= 100);

-- A 0% line and an exempt line are different things on a printed document, and
-- the difference is the stated reason. Held per line rather than per document
-- because one document can carry both taxed and zero-rated lines.
alter table public.order_items
  add column if not exists zero_rate_reason text;

alter table public.invoice_lines
  add column if not exists zero_rate_reason text;

-- `invoice_lines.gst_rate` keeps its existing default of 0 on purpose. Bills of
-- supply and delivery challans have no tax, and `recompute_document_totals()`
-- forces the rate to 0 for every non-taxable document type. Flipping the
-- default to 18 would make an untaxed document type briefly look taxed.

-- ---------------------------------------------------------------------------
-- 2. Where a zero-rated line gets its reason
-- ---------------------------------------------------------------------------

-- A check constraint cannot reach the buyer's exemption reason: an order line
-- reaches the company through orders -> inquiries -> companies. So this is a
-- trigger, which also lets the company-level reason fill the line in rather
-- than making the user retype it.
--
-- The reason is copied onto the line, not read through a join at print time.
-- A company record edited next year must not rewrite what a document said on
-- the day it was raised.
create or replace function public.resolve_zero_rate_reason()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  company_reason text;
begin
  if new.gst_rate is distinct from 0 then
    -- A rate above zero cannot carry an exemption reason; it would print a
    -- contradiction.
    new.zero_rate_reason := null;
    return new;
  end if;

  if btrim(coalesce(new.zero_rate_reason, '')) <> '' then
    return new;
  end if;

  select btrim(coalesce(c.gst_exemption_reason, ''))
    into company_reason
    from public.orders o
    join public.inquiries q on q.id = o.inquiry_id
    join public.companies c on c.id = q.company_id
   where o.id = new.order_id;

  if coalesce(company_reason, '') = '' then
    raise exception 'A 0%% line needs a reason: either set one on the line, or record a GST exemption reason on the company.'
      using errcode = 'check_violation';
  end if;

  new.zero_rate_reason := company_reason;
  return new;
end $$;

revoke all on function public.resolve_zero_rate_reason() from anon, authenticated;

create trigger order_items_zero_rate_reason
  before insert or update of gst_rate, zero_rate_reason on public.order_items
  for each row execute function public.resolve_zero_rate_reason();

-- ---------------------------------------------------------------------------
-- 3. orders.gst_amount / total_with_gst: generated -> trigger-maintained
-- ---------------------------------------------------------------------------
-- Done in this exact order so no row is ever without a value:
--   drop the generated columns -> add plain ones -> write the snapshot back
--   -> only then attach the trigger.
-- Attaching the trigger first would let it fire against empty columns.

-- `balance_pending` has to go too: it independently re-derived the same flat
-- 18% rather than reading `total_with_gst`. Left alone it would keep reporting
-- an 18% balance on a mixed-rate order.
alter table public.orders drop column if exists balance_pending;
alter table public.orders drop column if exists total_with_gst;
alter table public.orders drop column if exists gst_amount;

alter table public.orders add column gst_amount     numeric(14,2) not null default 0;
alter table public.orders add column total_with_gst numeric(14,2) not null default 0;

-- Restore exactly what the generated columns held. Not recomputed — copied.
update public.orders o
   set gst_amount     = s.gst_amount,
       total_with_gst = s.total_with_gst
  from pre_phase4.orders s
 where s.id = o.id;

-- Still generated, but now derived from the stored total rather than from a
-- second hardcoded rate, so it follows whatever the lines actually say.
alter table public.orders
  add column balance_pending numeric(14,2)
  generated always as (total_with_gst - advance_received) stored;

-- ---------------------------------------------------------------------------
-- 4. The recompute
-- ---------------------------------------------------------------------------
create or replace function public.recalc_order_tax(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_value numeric(14,2);
  v_tax   numeric(14,2);
begin
  if not exists (select 1 from public.orders where id = p_order_id) then
    return;
  end if;

  -- ORD-2026-0001 carries a typed value and ₹30,600 of tax with no line items
  -- behind it, inherited from the generated column. Summing its (nonexistent)
  -- lines would compute zero and wipe real money off a live order.
  --
  -- The test is "has this order ever had a line", including soft-deleted ones,
  -- not "has it any live lines". An order whose last line was removed SHOULD
  -- fall to zero — `recalc_order_value()` already takes its value to zero, and
  -- leaving stale tax beside a zero value would be worse than either.
  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    return;
  end if;

  -- Rounded per line, then summed. Never rate applied to a document total:
  -- with mixed rates there is no single rate to apply, and even at one rate
  -- the two differ by a paisa often enough to fail a reconciliation.
  select coalesce(sum(amount), 0),
         coalesce(sum(round(amount * gst_rate / 100, 2)), 0)
    into v_value, v_tax
    from public.order_items
   where order_id = p_order_id and deleted_at is null;

  update public.orders
     set gst_amount     = v_tax,
         total_with_gst = v_value + v_tax
   where id = p_order_id
     and (gst_amount is distinct from v_tax
          or total_with_gst is distinct from v_value + v_tax);
end $$;

revoke all on function public.recalc_order_tax(uuid) from anon, authenticated;

create or replace function public.order_items_recalc_tax()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.recalc_order_tax(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end $$;

revoke all on function public.order_items_recalc_tax() from anon, authenticated;

-- Fires after `order_items_recalc`, which sets `order_value` from the same
-- lines. Alphabetical order of trigger names is what Postgres uses, and
-- "order_items_recalc" sorts before "order_items_recalc_tax".
create trigger order_items_recalc_tax
  after insert or update or delete on public.order_items
  for each row execute function public.order_items_recalc_tax();

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- Pass condition: identical to the 'before' row, and to the Phase 3 baseline
-- 35ea75e07ba27240dd47156ea431f328.
--
--   select md5(string_agg(
--            id::text || ':' || coalesce(order_value::text,'') || ':' ||
--            coalesce(gst_amount::text,'') || ':' ||
--            coalesce(total_with_gst::text,''), '|' order by id)),
--          count(*), sum(order_value), sum(gst_amount), sum(total_with_gst)
--     from public.orders;
