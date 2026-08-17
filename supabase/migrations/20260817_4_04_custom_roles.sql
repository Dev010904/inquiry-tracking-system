-- Part 4.04 — custom roles with per-feature permissions.
--
-- This LAYERS ON TOP of the existing model. It does not replace it.
--
-- `profiles.role` (the admin/staff enum) and `is_admin()` are deliberately
-- UNCHANGED, and must stay that way. Row-level security on nearly every table
-- in this database calls `is_admin()`; rewriting it to consult a role table
-- would take the whole application down the moment this deploys.
--
-- The two answer different questions and must not be "unified" later:
--
--   * the enum governs the ADMIN CAPABILITY — who may delete, who may
--     reassign someone else's work. That is what RLS depends on.
--   * roles govern FEATURE VISIBILITY — which screens a user may open and
--     which they may edit. Nothing in RLS depends on that.
--
-- `profiles.role_id` is nullable and NULL means "fall back to the enum".
-- Nobody is given a role here, so every existing user keeps working exactly as
-- they did the moment this deploys.

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  -- Seeded roles that mirror today's behaviour. They cannot be renamed or
  -- deleted; see guard_system_role() below.
  is_system   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.roles is
  'Named permission sets. Feature visibility only — the admin capability that '
  'RLS depends on is still profiles.role. Do not merge the two.';

alter table public.roles
  add constraint roles_name_not_blank check (btrim(name) <> '');

-- ---------------------------------------------------------------------------
-- role_features
-- ---------------------------------------------------------------------------

create table if not exists public.role_features (
  role_id     uuid not null references public.roles(id) on delete cascade,
  feature_key text not null,
  can_view    boolean not null default false,
  can_edit    boolean not null default false,
  primary key (role_id, feature_key)
);

-- The grantable feature list, mirrored by FEATURE_KEYS in
-- `src/lib/constants.ts`. Both must be changed together — the application list
-- drives the nav and the permission editor, this one is the last line of
-- defence.
--
-- `settings` is deliberately ABSENT and must stay absent. Settings is governed
-- solely by `profiles.can_manage_settings`. If it were grantable, any admin
-- could invent a role that hands themselves Settings and the Phase 3
-- restriction would be gone. Rejecting it here rather than only in the editor
-- means a hand-crafted API call cannot do it either.
alter table public.role_features
  add constraint role_features_key_grantable check (
    feature_key in (
      'dashboard', 'inquiries', 'orders', 'rnd', 'ip',
      'documents', 'meetings', 'companies', 'activity', 'reports'
    )
  );

-- An edit right without a view right is meaningless and would let a role look
-- permissive in the editor while showing nothing.
alter table public.role_features
  add constraint role_features_edit_implies_view check (not can_edit or can_view);

create index if not exists role_features_role_idx on public.role_features (role_id);

-- ---------------------------------------------------------------------------
-- profiles.role_id
-- ---------------------------------------------------------------------------

-- ON DELETE SET NULL: deleting a role must not orphan a user. The decision is
-- to null their role_id so they fall back to the enum, rather than blocking
-- the delete. The fallback path is the behaviour that has been running in
-- production since day one, so it is the known-safe place to land; blocking
-- would instead leave an admin unable to tidy up without first hunting down
-- every holder.
alter table public.profiles
  add column if not exists role_id uuid references public.roles(id) on delete set null;

comment on column public.profiles.role_id is
  'Optional custom role. NULL means fall back to profiles.role. This column '
  'never governs the admin capability — profiles.role still does.';

create index if not exists profiles_role_id_idx on public.profiles (role_id);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.guard_system_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Migrations and the service role run without a JWT. They are how the
  -- system roles got here in the first place.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'A system role cannot be deleted';
    end if;
    return old;
  end if;

  if old.is_system and new.name is distinct from old.name then
    raise exception 'A system role cannot be renamed';
  end if;

  -- Otherwise an admin could flag their own invented role as a system role to
  -- make it undeletable, or clear the flag off a seeded one to delete it.
  if new.is_system is distinct from old.is_system then
    raise exception 'Whether a role is a system role cannot be changed';
  end if;

  return new;
end $$;

create trigger roles_guard_system
  before update or delete on public.roles
  for each row execute function public.guard_system_role();

create trigger roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create trigger roles_audit
  after insert or update or delete on public.roles
  for each row execute function public.log_activity();

-- No audit trigger on role_features: log_activity() reads NEW.id, and this
-- table has a composite key and no id column.

-- ---------------------------------------------------------------------------
-- log_activity() — two additive changes
-- ---------------------------------------------------------------------------
--
-- 1. `roles` and `tasks` get proper entity names, instead of falling through
--    to initcap() and reading "Roles Administrator created".
-- 2. A task reassignment prints the two people's NAMES. The generic diff
--    branch would render "changed: assigned to", and the raw uuids sit
--    unreadable in the diff — the owner specifically asked to see who work
--    moved from and to in Recent changes.
--
-- The `tasks` half lands here, one migration ahead of the table itself, so
-- this function is replaced once rather than twice. Everything else is
-- character-for-character the definition that was already running.

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
  s_from   text := null;
  s_to     text := null;
  who_from text := null;
  who_to   text := null;
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

    -- Reassignment first: on a task it is the more significant of the two,
    -- and a status change alongside it is appended rather than lost.
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

/**
 * Nobody edits the permissions of the role they themselves hold.
 *
 * Without this, an admin assigned a restricted role could simply grant it
 * everything back, and the restriction would be decorative.
 */
create or replace function public.guard_own_role_features()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target uuid;
  fkey   text;
  mine   uuid;
begin
  -- NEW is unassigned on DELETE, so read the row that actually exists rather
  -- than coalescing across the two.
  if tg_op = 'DELETE' then
    target := old.role_id; fkey := old.feature_key;
  else
    target := new.role_id; fkey := new.feature_key;
  end if;

  -- Checked before the auth.uid() escape below, so the friendly message is
  -- what anyone sees. The check constraint above is the real enforcement.
  if fkey = 'settings' then
    raise exception
      'Settings cannot be granted through a role. It is governed by can_manage_settings.';
  end if;

  if auth.uid() is not null then
    select p.role_id into mine from public.profiles p where p.id = auth.uid();

    if mine is not null and mine = target then
      raise exception 'You cannot change the permissions of the role you hold';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger role_features_guard_own
  before insert or update or delete on public.role_features
  for each row execute function public.guard_own_role_features();

/**
 * Nobody assigns themselves a role — not even an admin.
 *
 * Separate from guard_profile_privileges() on purpose. That function returns
 * early for admins, and this rule has to bite an admin too.
 */
create or replace function public.guard_profile_role_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role_id is distinct from old.role_id then
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role';
    end if;
    if not public.is_admin() then
      raise exception 'Only an admin may assign a role';
    end if;
  end if;

  return new;
end $$;

create trigger profiles_guard_role_id
  before update on public.profiles
  for each row execute function public.guard_profile_role_id();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.roles         enable row level security;
alter table public.role_features enable row level security;

-- Every active member reads: the app resolves its own permissions from these
-- two tables on every request, and a role list is not sensitive.
create policy roles_select on public.roles
  for select using (public.is_active_member());
create policy roles_insert on public.roles
  for insert with check (public.is_admin());
create policy roles_update on public.roles
  for update using (public.is_admin()) with check (public.is_admin());
create policy roles_delete on public.roles
  for delete using (public.is_admin());

create policy role_features_select on public.role_features
  for select using (public.is_active_member());
create policy role_features_insert on public.role_features
  for insert with check (public.is_admin());
create policy role_features_update on public.role_features
  for update using (public.is_admin()) with check (public.is_admin());
create policy role_features_delete on public.role_features
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed — must not change anyone's experience
-- ---------------------------------------------------------------------------
--
-- Both seeded roles carry view and edit on every grantable feature, because
-- that is exactly what both an admin and a staff member can reach today: the
-- sidebar filters only Settings, and Settings is not grantable here. Admin and
-- staff differ in DELETE rights and in who may reassign work, and those live
-- in RLS on profiles.role — not in this table.
--
-- Nobody is assigned either role. They exist as a starting point an admin can
-- copy, and as documentation of what "no role" means.

insert into public.roles (name, description, is_system)
values
  ('Administrator',
   'Everything, matching an admin account today. Cannot be renamed or deleted.',
   true),
  ('Staff',
   'Everything except Settings, matching a staff account today. Cannot be renamed or deleted.',
   true)
on conflict (name) do nothing;

insert into public.role_features (role_id, feature_key, can_view, can_edit)
select r.id, k.feature_key, true, true
  from public.roles r
 cross join (values
   ('dashboard'), ('inquiries'), ('orders'), ('rnd'), ('ip'),
   ('documents'), ('meetings'), ('companies'), ('activity'), ('reports')
 ) as k(feature_key)
 where r.is_system
on conflict (role_id, feature_key) do nothing;
