-- Phase 2A · 02 · log_activity() gains a plain-language summary and a reason.
--
-- Applied 04 Aug 2026. Specification: docs/specs/PHASE-2-REQUIREMENTS.md §3.6.
--
-- Deliberately unchanged from the previous version:
--   * the diff shape — {"column": {"from": …, "to": …}} on update, whole row otherwise
--   * the exclusion of updated_at from diffs
--   * the early return when an update changes nothing meaningful; losing this
--     would flood the feed with no-op rows
--
-- New: a soft delete arrives as an UPDATE that sets deleted_at, and is now
-- reported as "deleted" rather than "updated", because that is what users call it.
--
-- The reason is read from a transaction-local setting. PostgREST runs each
-- request in its own transaction, so this is only ever populated by a function
-- that sets it and performs its write together — see file 04.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rid      uuid;
  d        jsonb;
  full_row jsonb;
  entity   text;
  lbl      text;
  verb     text;
  detail   text := '';
  changed  text;
begin
  if tg_op = 'DELETE' then
    rid := old.id; d := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    rid := new.id; d := to_jsonb(new);
  else
    rid := new.id;
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into d
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key not in ('updated_at');
    if d is null or d = '{}'::jsonb then return coalesce(new, old); end if;
  end if;

  full_row := to_jsonb(coalesce(new, old));

  entity := case tg_table_name
    when 'orders'       then 'Order'        when 'inquiries'    then 'Inquiry'
    when 'payments'     then 'Payment'      when 'followups'    then 'Follow-up'
    when 'companies'    then 'Company'      when 'contacts'     then 'Contact'
    when 'rnd_projects' then 'R&D project'  when 'rnd_expenses' then 'R&D expense'
    when 'work_updates' then 'Work update'  when 'ip_assets'    then 'IP asset'
    when 'ip_events'    then 'IP event'     when 'profiles'     then 'Staff account'
    else initcap(replace(tg_table_name, '_', ' ')) end;

  -- A readable handle for the record. Money rows have no name, so they carry
  -- their amount instead.
  lbl := case
    when tg_table_name in ('payments', 'rnd_expenses')
      then 'of ' || coalesce(full_row->>'amount', '?')
    else coalesce(full_row->>'order_no', full_row->>'inquiry_no',
                  full_row->>'project_code', full_row->>'title',
                  full_row->>'name', full_row->>'full_name', '')
  end;

  verb := case
    when tg_op = 'INSERT' then 'created'
    when tg_op = 'DELETE' then 'permanently deleted'
    when d ? 'deleted_at' and (d->'deleted_at'->>'to') is not null then 'deleted'
    when d ? 'deleted_at' and (d->'deleted_at'->>'to') is null     then 'restored'
    else 'updated'
  end;

  if tg_op = 'UPDATE' and verb = 'updated' then
    if d ? 'order_status' then
      detail := ' — status ' || replace(d->'order_status'->>'from', '_', ' ')
                             || ' to ' || replace(d->'order_status'->>'to', '_', ' ');
    elsif d ? 'status' then
      detail := ' — status ' || replace(d->'status'->>'from', '_', ' ')
                             || ' to ' || replace(d->'status'->>'to', '_', ' ');
    elsif d ? 'stage' then
      detail := ' — stage ' || replace(d->'stage'->>'from', '_', ' ')
                            || ' to ' || replace(d->'stage'->>'to', '_', ' ');
    elsif d ? 'is_done' and (d->'is_done'->>'to') = 'true' then
      detail := ' — marked done';
    else
      select ' — changed: ' || string_agg(replace(k, '_', ' '), ', ' order by k)
        into changed
        from jsonb_object_keys(d) k;
      detail := coalesce(changed, '');
    end if;
  end if;

  insert into public.activity_log(table_name, row_id, action, actor_id, diff, summary, note)
  values (tg_table_name, rid, lower(tg_op), auth.uid(), d,
          trim(entity || case when lbl <> '' then ' ' || lbl else '' end || ' ' || verb || detail),
          nullif(current_setting('app.change_note', true), ''));

  return coalesce(new, old);
end $function$;

revoke execute on function public.log_activity() from anon, authenticated;

-- Verified live against all five shapes, then the test rows were removed and
-- the inquiry sequence reset:
--   insert         -> "Company ZZ Trigger Test Ltd created"
--   plain update   -> "Company ZZ Trigger Test Ltd updated — changed: city"
--   status change  -> "Inquiry INQ-2026-0009 updated — status new to quoted"
--   soft delete    -> "Company ZZ Trigger Test Ltd deleted"
