-- Phase 2B, migration 2 of 3
-- Opening lines are inserted BEFORE the recalculation trigger exists, so
-- existing order values are reproduced exactly rather than recomputed from
-- an empty set. Verify with the query at the bottom before continuing.
insert into public.order_items (order_id, line_no, description, quantity, unit, rate, notes, created_by)
select o.id, 1,
       'Opening balance — as originally recorded',
       1, 'lot'::public.item_unit, o.order_value,
       'Created automatically when line items were introduced. Replace with real lines when known.',
       o.created_by
from public.orders o
where o.deleted_at is null
  and not exists (select 1 from public.order_items i where i.order_id = o.id);

-- Pass condition: every row shows diff = 0.00
-- select o.order_no, o.order_value, sum(i.amount) items_total, o.order_value - sum(i.amount) diff
-- from orders o join order_items i on i.order_id = o.id and i.deleted_at is null
-- where o.deleted_at is null group by o.order_no, o.order_value;
