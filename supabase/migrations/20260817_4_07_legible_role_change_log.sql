-- Name the roles in Recent changes when someone's role is changed.
--
-- Before this, assigning a role logged "Staff account opsongs91 updated —
-- changed: role id", which tells a reader that something happened and nothing
-- about what. Reassigning a task already resolved both people by name; this
-- gives a role change the same treatment.
--
-- Three cases have to read properly:
--   * null -> a role, and a role -> null, print "No role" on the empty side
--     rather than a blank or the word null.
--   * a role that no longer exists prints "a deleted role". This is not
--     hypothetical: profiles.role_id is `on delete set null`, so deleting a
--     role fires this trigger with a from-id whose row has already gone.
--   * the `role` enum (Staff/Admin) is a different thing from role_id and is
--     named separately as the access level, because the two are deliberately
--     independent — role_id governs feature visibility, the enum still governs
--     the admin capability that RLS is built on.
--
-- Anything else changed in the same save is still listed, so no information is
-- lost compared with the generic branch this replaces.
--
-- The rest of the function is unchanged from
-- 20260813_restrict_internal_document_helpers.sql onwards. Only the profiles
-- branch is new.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rid       uuid;
  d         jsonb;
  full_row  jsonb;
  entity    text;
  lbl       text;
  verb      text;
  detail    text := '';
  changed   text;
  s_from    text := null;
  s_to      text := null;
  who_from  text := null;
  who_to    text := null;
  role_from text := null;
  role_to   text := null;
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
    when 'invoices'     then 'Document'     when 'qa_checks'    then 'QA check'
    when 'meetings'     then 'Meeting'      when 'order_items'  then 'Order line'
    when 'roles'        then 'Role'         when 'tasks'        then 'Task'
    else initcap(replace(tg_table_name, '_', ' ')) end;

  lbl := case
    when tg_table_name in ('payments', 'rnd_expenses')
      then 'of ' || coalesce(full_row->>'amount', '?')
    else coalesce(full_row->>'order_no', full_row->>'inquiry_no',
                  full_row->>'project_code', full_row->>'document_no',
                  full_row->>'title', full_row->>'name', full_row->>'full_name', '')
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
      s_from := d->'order_status'->>'from'; s_to := d->'order_status'->>'to';
    elsif d ? 'status' then
      s_from := d->'status'->>'from';       s_to := d->'status'->>'to';
    elsif d ? 'stage' then
      s_from := d->'stage'->>'from';        s_to := d->'stage'->>'to';
    end if;

    if tg_table_name = 'tasks' and d ? 'assigned_to' then
      select p.full_name into who_from from public.profiles p
       where p.id = (d->'assigned_to'->>'from')::uuid;
      select p.full_name into who_to   from public.profiles p
       where p.id = (d->'assigned_to'->>'to')::uuid;

      detail := ' — reassigned from ' || coalesce(who_from, 'nobody')
                                      || ' to ' || coalesce(who_to, 'nobody');
      if s_to is not null then
        detail := detail || ', status ' || replace(coalesce(s_from, '?'), '_', ' ')
                         || ' to ' || replace(s_to, '_', ' ');
      end if;

    elsif tg_table_name = 'profiles' and (d ? 'role_id' or d ? 'role') then
      if d ? 'role_id' then
        if (d->'role_id'->>'from') is null then
          role_from := 'No role';
        else
          select r.name into role_from from public.roles r
           where r.id = (d->'role_id'->>'from')::uuid;
          role_from := coalesce(role_from, 'a deleted role');
        end if;

        if (d->'role_id'->>'to') is null then
          role_to := 'No role';
        else
          select r.name into role_to from public.roles r
           where r.id = (d->'role_id'->>'to')::uuid;
          role_to := coalesce(role_to, 'a deleted role');
        end if;

        detail := ' — role changed from ' || role_from || ' to ' || role_to;
      end if;

      if d ? 'role' then
        detail := detail
               || case when detail = '' then ' — access level ' else ', access level ' end
               || coalesce(d->'role'->>'from', '?') || ' to '
               || coalesce(d->'role'->>'to', '?');
      end if;

      -- Whatever else moved in the same save still gets named.
      select string_agg(replace(k, '_', ' '), ', ' order by k)
        into changed
        from jsonb_object_keys(d) k
       where k not in ('role_id', 'role');
      if changed is not null then
        detail := detail || ', also changed: ' || changed;
      end if;

    elsif s_to is not null then
      detail := ' — status ' || replace(coalesce(s_from,'?'), '_', ' ')
                             || ' to ' || replace(s_to, '_', ' ');
    elsif d ? 'is_done' and (d->'is_done'->>'to') = 'true' then
      detail := ' — marked done';
    else
      select ' — changed: ' || string_agg(replace(k, '_', ' '), ', ' order by k)
        into changed from jsonb_object_keys(d) k;
      detail := coalesce(changed, '');
    end if;
  end if;

  insert into public.activity_log(table_name, row_id, action, actor_id, diff,
                                  summary, note, status_from, status_to)
  values (tg_table_name, rid, lower(tg_op), auth.uid(), d,
          trim(entity || case when lbl <> '' then ' ' || lbl else '' end || ' ' || verb || detail),
          nullif(current_setting('app.change_note', true), ''),
          s_from, s_to);

  return coalesce(new, old);
end $function$;
