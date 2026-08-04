-- Phase 2D — QA/QC gate before dispatch.
create type public.qa_result as enum ('pass','fail','conditional_pass');
create type public.qa_media_kind as enum ('photo','video');

create table public.qa_checks (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  report_no     text,
  checked_on    date not null default current_date,
  checked_by    uuid references public.profiles(id),
  result        public.qa_result not null default 'pass',
  description   text not null check (length(btrim(description)) >= 10),
  observations  text,
  conditions    text,
  approved_by   uuid references public.profiles(id),
  approved_at   timestamptz,
  deleted_at    timestamptz,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A conditional pass without the conditions written down is just a pass
  -- that nobody can be held to.
  constraint conditional_needs_conditions
    check (result <> 'conditional_pass' or coalesce(btrim(conditions),'') <> '')
);

create index qa_checks_order_idx on public.qa_checks (order_id) where deleted_at is null;

create table public.qa_media (
  id            uuid primary key default gen_random_uuid(),
  qa_check_id   uuid not null references public.qa_checks(id) on delete cascade,
  kind          public.qa_media_kind not null,
  storage_path  text,
  external_url  text,
  caption       text,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  -- Exactly one location. A row with both is ambiguous; a row with neither
  -- is evidence of nothing.
  constraint one_location check (
    (storage_path is not null and external_url is null) or
    (storage_path is null and external_url is not null)
  )
);

create index qa_media_check_idx on public.qa_media (qa_check_id);

alter table public.qa_checks enable row level security;
alter table public.qa_media enable row level security;

create policy qa_checks_select on public.qa_checks for select using (is_active_member());
create policy qa_checks_insert on public.qa_checks for insert with check (is_active_member());
create policy qa_checks_update on public.qa_checks for update using (is_active_member()) with check (is_active_member());
create policy qa_checks_delete on public.qa_checks for delete using (is_admin());
create policy qa_media_select on public.qa_media for select using (is_active_member());
create policy qa_media_write on public.qa_media for all using (is_active_member()) with check (is_active_member());

create trigger qa_checks_updated before update on public.qa_checks
  for each row execute function set_updated_at();
create trigger qa_checks_guard_delete before update on public.qa_checks
  for each row execute function guard_soft_delete();
create trigger qa_checks_audit after insert or delete or update on public.qa_checks
  for each row execute function log_activity();

-- Evidence rules. A passing check must carry a description, at least one
-- photo and at least one video, or it is an assertion rather than a record.
create or replace function public.qa_check_is_complete(p_check_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.qa_checks c
     where c.id = p_check_id and c.deleted_at is null
       and coalesce(btrim(c.description),'') <> ''
       and exists (select 1 from public.qa_media m where m.qa_check_id = c.id and m.kind = 'photo')
       and exists (select 1 from public.qa_media m where m.qa_check_id = c.id and m.kind = 'video')
  );
$$;

alter table public.orders add column qa_override_reason text;
alter table public.orders add column qa_overridden_by uuid references public.profiles(id);
alter table public.orders add column qa_overridden_at timestamptz;

-- Dispatch gate. Enforced here rather than only in the form, so it holds
-- whatever route the change arrives by.
create or replace function public.guard_dispatch_needs_qa()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ok boolean;
begin
  if new.order_status not in ('dispatched','delivered','closed') then return new; end if;
  if old.order_status = new.order_status then return new; end if;

  -- An admin override is allowed, but it must say why and it lands in the
  -- activity feed like any other change. A rule with no escape hatch gets
  -- worked around; one with a recorded escape hatch gets respected.
  if coalesce(btrim(new.qa_override_reason),'') <> ''
     and new.qa_override_reason is distinct from old.qa_override_reason then
    if not public.is_admin() then
      raise exception 'Only an admin can dispatch without a passed QA check.';
    end if;
    new.qa_overridden_by := auth.uid();
    new.qa_overridden_at := now();
    return new;
  end if;

  select exists (
    select 1 from public.qa_checks c
     where c.order_id = new.id and c.deleted_at is null
       and c.result in ('pass','conditional_pass')
       and public.qa_check_is_complete(c.id)
  ) into ok;

  if not ok then
    raise exception 'This order cannot be dispatched yet: it needs a QA check marked passed, with a description, at least one photo and at least one video.';
  end if;

  return new;
end $$;

create trigger orders_guard_dispatch before update on public.orders
  for each row execute function public.guard_dispatch_needs_qa();

-- QA photos. Private bucket: evidence is readable only by signed-in staff,
-- through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qa-evidence', 'qa-evidence', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "qa evidence readable by staff" on storage.objects
  for select to authenticated using (bucket_id = 'qa-evidence' and public.is_active_member());
create policy "qa evidence writable by staff" on storage.objects
  for insert to authenticated with check (bucket_id = 'qa-evidence' and public.is_active_member());
create policy "qa evidence removable by admin" on storage.objects
  for delete to authenticated using (bucket_id = 'qa-evidence' and public.is_admin());
