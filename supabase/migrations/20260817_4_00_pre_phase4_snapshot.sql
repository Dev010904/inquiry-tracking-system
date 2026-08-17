-- Snapshot of every table Phase 4 touches, taken before the first Phase 4
-- migration runs.
--
-- Same reasoning as `pre_phase3`: the database is in daily use, there is no
-- staging copy, and the only way back from a bad migration is a row-for-row
-- original. Each table is copied whole, soft-deleted rows included, into a
-- schema the application cannot see.
--
-- `pre_phase4` is deliberately not in Supabase's exposed-schema list, so
-- PostgREST will not serve it. The revokes are belt and braces.
--
-- Nothing here restores anything. An accidental restore would be as damaging
-- as the loss it was meant to undo.

create schema if not exists pre_phase4;

revoke all on schema pre_phase4 from public, anon, authenticated;

create table if not exists pre_phase4.profiles         as table public.profiles;
create table if not exists pre_phase4.company_settings as table public.company_settings;
create table if not exists pre_phase4.orders           as table public.orders;
create table if not exists pre_phase4.order_items      as table public.order_items;
create table if not exists pre_phase4.invoices         as table public.invoices;
create table if not exists pre_phase4.invoice_lines    as table public.invoice_lines;

revoke all on all tables in schema pre_phase4 from public, anon, authenticated;

-- The same fingerprint expression Phase 3 used, so the two phases are
-- comparing like with like. Ordering by id keeps the hash stable regardless
-- of physical row order.
create table if not exists pre_phase4.money_fingerprint as
select
  'orders' as source,
  'before' as taken_at,
  md5(string_agg(
    id::text || ':' || coalesce(order_value::text, '') || ':' ||
    coalesce(gst_amount::text, '') || ':' || coalesce(total_with_gst::text, ''),
    '|' order by id
  )) as fingerprint,
  count(*) as row_count,
  sum(order_value) as sum_order_value,
  sum(gst_amount) as sum_gst_amount,
  sum(total_with_gst) as sum_total_with_gst
from public.orders;

revoke all on all tables in schema pre_phase4 from public, anon, authenticated;

-- Verification: every snapshot must match its live table row for row.
--   select 'orders' t, (select count(*) from public.orders) live,
--          (select count(*) from pre_phase4.orders) snap
--   union all select 'order_items', (select count(*) from public.order_items),
--          (select count(*) from pre_phase4.order_items);
-- Pass condition: live = snap on every row.
--
-- Expected fingerprint carried forward from the end of Phase 3:
--   35ea75e07ba27240dd47156ea431f328
