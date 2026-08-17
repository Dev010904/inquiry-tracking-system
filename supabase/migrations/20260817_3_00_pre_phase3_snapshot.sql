-- Snapshot of every table Phase 3 touches, taken before the first Phase 3
-- migration runs.
--
-- This database is in daily use and has no staging copy, so the only way back
-- from a bad migration is a row-for-row original. Each table is copied whole,
-- including soft-deleted rows, into a schema the application cannot see.
--
-- `pre_phase3` is deliberately not in Supabase's exposed-schema list, so
-- PostgREST will not serve it. The revokes below are belt and braces: if the
-- schema is ever added to that list by accident, the API roles still hold
-- nothing on it.
--
-- To restore a table, copy rows back explicitly. Nothing here does that
-- automatically — an accidental restore would be as damaging as the loss.

create schema if not exists pre_phase3;

revoke all on schema pre_phase3 from public, anon, authenticated;

create table if not exists pre_phase3.profiles         as table public.profiles;
create table if not exists pre_phase3.company_settings as table public.company_settings;
create table if not exists pre_phase3.inquiries        as table public.inquiries;
create table if not exists pre_phase3.orders           as table public.orders;
create table if not exists pre_phase3.order_items      as table public.order_items;
create table if not exists pre_phase3.invoices         as table public.invoices;
create table if not exists pre_phase3.invoice_lines    as table public.invoice_lines;
create table if not exists pre_phase3.rnd_projects     as table public.rnd_projects;
create table if not exists pre_phase3.rnd_expenses     as table public.rnd_expenses;

revoke all on all tables in schema pre_phase3 from public, anon, authenticated;

-- The fingerprint the money migrations are checked against. Order by id so the
-- hash is stable regardless of physical row order.
create table if not exists pre_phase3.money_fingerprint as
select
  'orders' as source,
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

revoke all on all tables in schema pre_phase3 from public, anon, authenticated;

-- Verification: every snapshot must match its live table row for row.
--   select 'profiles' t, (select count(*) from public.profiles) live,
--          (select count(*) from pre_phase3.profiles) snap
--   union all select 'orders', (select count(*) from public.orders),
--          (select count(*) from pre_phase3.orders);
-- Pass condition: live = snap on every row.
