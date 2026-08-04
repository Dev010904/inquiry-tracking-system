-- Phase 2B, migration 3 of 3
-- The order value follows the lines. Fires on insert, update and delete,
-- and ignores soft-deleted lines.
create or replace function public.recalc_order_value()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  oid_ uuid := coalesce(new.order_id, old.order_id);
  total numeric(14,2);
begin
  -- The parent may already be gone (delete cascade); nothing to recalculate.
  if not exists (select 1 from public.orders where id = oid_) then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into total
    from public.order_items
   where order_id = oid_ and deleted_at is null;

  -- Only write when it actually differs, so no-op edits do not flood the
  -- activity feed with meaningless "order value changed" rows.
  update public.orders
     set order_value = total
   where id = oid_ and order_value is distinct from total;

  return coalesce(new, old);
end $$;

create trigger order_items_recalc
  after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_value();
