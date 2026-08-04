-- Phase 2B, migration 1 of 3
-- Order line items. `orders.order_value` stops being a typed figure and
-- becomes the sum of these lines (see migration 3).
create type public.item_unit as enum ('nos','set','kg','m','hour','lot');

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  line_no       integer not null,
  description   text not null check (length(btrim(description)) > 0),
  hsn_sac       text,
  quantity      numeric(12,3) not null check (quantity > 0),
  unit          public.item_unit not null default 'nos',
  rate          numeric(14,2) not null check (rate >= 0),
  amount        numeric(14,2) generated always as (round(quantity * rate, 2)) stored,
  notes         text,
  deleted_at    timestamptz,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index order_items_line_no_uniq
  on public.order_items (order_id, line_no) where deleted_at is null;
create index order_items_order_id_idx on public.order_items (order_id) where deleted_at is null;

alter table public.order_items enable row level security;

create policy order_items_select on public.order_items for select using (is_active_member());
create policy order_items_insert on public.order_items for insert with check (is_active_member());
create policy order_items_update on public.order_items for update using (is_active_member()) with check (is_active_member());
create policy order_items_delete on public.order_items for delete using (is_admin());

create trigger order_items_updated before update on public.order_items
  for each row execute function set_updated_at();
create trigger order_items_guard_delete before update on public.order_items
  for each row execute function guard_soft_delete();
create trigger order_items_audit after insert or delete or update on public.order_items
  for each row execute function log_activity();
