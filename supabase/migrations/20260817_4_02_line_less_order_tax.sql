-- Phase 4, part 1 (correction) — tax on an order that has no lines yet.
--
-- `20260817_4_01_per_line_gst.sql` made `orders.gst_amount` trigger-maintained
-- from the line items, and made that trigger skip an order with no lines so it
-- could not wipe ORD-2026-0001's inherited ₹30,600.
--
-- That left a hole at the other end. Convert-to-order creates an order from a
-- typed value with no lines at all, and the old GENERATED column used to give
-- it 18% for free. Without this file every newly converted order would sit at
-- zero GST until somebody added a line — a visible, wrong number on a live
-- screen.
--
-- So: lines decide the tax when there are lines; the company default rate
-- decides it when there are none.

create or replace function public.seed_line_less_order_tax()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rate numeric(5,2);
begin
  -- An order with lines is the line trigger's business, not this one's.
  if exists (select 1 from public.order_items where order_id = new.id) then
    return new;
  end if;

  select default_gst_rate into v_rate from public.company_settings where singleton;
  v_rate := coalesce(v_rate, 18);

  new.gst_amount     := round(new.order_value * v_rate / 100, 2);
  new.total_with_gst := new.order_value + new.gst_amount;
  return new;
end $$;

revoke all on function public.seed_line_less_order_tax() from anon, authenticated;

-- INSERT, and UPDATE only when the value itself moved.
--
-- Firing on every update would let a later change to the company's default
-- rate silently rewrite the tax on orders raised under the old one. Tying it
-- to `order_value` reproduces exactly when the old generated column would have
-- recalculated, and leaves a settled order alone.
create trigger orders_seed_line_less_tax
  before insert on public.orders
  for each row execute function public.seed_line_less_order_tax();

create trigger orders_reseed_line_less_tax
  before update of order_value on public.orders
  for each row
  when (new.order_value is distinct from old.order_value)
  execute function public.seed_line_less_order_tax();

-- Verification, on the one order that exists:
--   ORD-2026-0001 has no lines and a stable value, so neither trigger fires
--   and its ₹30,600 is untouched. Fingerprint must still read
--   35ea75e07ba27240dd47156ea431f328.
