-- Phase 2A · 03 · staff-readable activity feed.
--
-- Applied 04 Aug 2026. Specification: docs/specs/PHASE-2-REQUIREMENTS.md §3.6.
--
-- activity_log itself stays admin-only, because its `diff` column holds the full
-- before/after of every change — including rows belonging to restricted IP
-- assets. This view never exposes diff.
--
-- Restricted IP rows are removed entirely rather than redacted. A row reading
-- "an IP asset you cannot see was updated" still leaks that it exists.
--
-- The view is security definer by design — it must read a table staff cannot —
-- so every restriction is written explicitly. security_barrier prevents a cheap
-- user-supplied function being evaluated before these conditions.
--
-- can_see_ip takes an ip_assets ROW, not an id, hence the join and can_see_ip(a).

create or replace view public.activity_feed
with (security_barrier = true) as
select
  al.id,
  al.created_at,
  al.table_name,
  al.row_id,
  al.action,
  al.summary,
  al.note,
  al.actor_id,
  coalesce(p.full_name, 'System') as actor_name
from public.activity_log al
left join public.profiles p on p.id = al.actor_id
where public.is_active_member()
  and (
    al.table_name not in ('ip_assets', 'ip_events')
    or (al.table_name = 'ip_assets' and exists (
          select 1 from public.ip_assets a
          where a.id = al.row_id and public.can_see_ip(a)))
    or (al.table_name = 'ip_events' and exists (
          select 1 from public.ip_events e
          join public.ip_assets a on a.id = e.ip_asset_id
          where e.id = al.row_id and public.can_see_ip(a)))
  );

comment on view public.activity_feed is
  'Staff-safe view of activity_log: summary and reason only, never the diff, with restricted IP rows removed.';

revoke all on public.activity_feed from anon;
grant select on public.activity_feed to authenticated;

-- Verified live:
--   anon                     -> no privilege at all
--   authenticated non-member -> 0 rows (is_active_member() false)
--   active admin             -> all 65 rows, including 6 IP asset rows
--   exposed columns          -> id, created_at, table_name, row_id, action,
--                               summary, note, actor_id, actor_name (no diff)
