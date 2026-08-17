-- Part 4.05 — task assignment and ownership locking.
--
-- One table serves both Part 4 (assignment) and Part 5 (the pending work card
-- on an R&D project and on an order). `parent_type` reuses the existing
-- `parent_kind` enum, the same way `work_updates` does, so the card is
-- genuinely one component rather than two that drift.
--
-- The rule the owner stated, in his words: if a person raises or is assigned
-- work, only that person completes it; admins assign and reassign. That is
-- enforced in RLS and a trigger, not in the UI — a server action is a public
-- endpoint and the screen it belongs to is not the only way to reach it.

create type public.task_status as enum ('open', 'in_progress', 'blocked', 'done');

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  parent_type  public.parent_kind not null,
  parent_id    uuid not null,
  title        text not null,
  detail       text,
  status       public.task_status not null default 'open',
  due_date     date,
  -- Not nullable: a task nobody owns is a note, and there is already a place
  -- for notes. Every task has exactly one person who can complete it.
  assigned_to  uuid not null references public.profiles(id),
  assigned_by  uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.tasks
  add constraint tasks_title_not_blank check (btrim(title) <> '');

-- Both are read on every page that shows the card: the first for "my work",
-- the second for "work on this project".
create index if not exists tasks_assignee_status_idx on public.tasks (assigned_to, status);
create index if not exists tasks_parent_idx on public.tasks (parent_type, parent_id);

comment on table public.tasks is
  'Work still to be done, against an order or an R&D project. Work updates '
  'record what was done; this records what is outstanding.';

-- ---------------------------------------------------------------------------
-- Bookkeeping the application must not be trusted to remember
-- ---------------------------------------------------------------------------

/**
 * `completed_at` follows `status`, in both directions.
 *
 * Set by trigger rather than by the application because the application will
 * forget — particularly on the way back, when a task marked done is reopened
 * and a stale completion date would sit on it looking authoritative.
 *
 * `assigned_by` is stamped here too, so a reassignment always records who did
 * it even if a caller omits the field.
 */
create or replace function public.sync_task_bookkeeping()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'done' then
    if new.completed_at is null then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  if tg_op = 'INSERT' then
    new.assigned_by := coalesce(new.assigned_by, auth.uid());
  elsif new.assigned_to is distinct from old.assigned_to then
    new.assigned_by := coalesce(auth.uid(), new.assigned_by);
  end if;

  return new;
end $$;

/**
 * Only the assignee moves their own work along; only an admin reassigns it.
 *
 * A non-admin assignee may change `status` and `detail` and nothing else — not
 * the title, not the due date, and above all not who it belongs to. Anyone who
 * is not the assignee and not an admin cannot touch the row at all.
 */
create or replace function public.guard_task_ownership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Migrations and the service role.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if old.assigned_to is distinct from auth.uid() then
    raise exception 'Only the person this work is assigned to may change it';
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    raise exception 'Only an admin may reassign work';
  end if;

  if new.title       is distinct from old.title
     or new.due_date    is distinct from old.due_date
     or new.parent_type is distinct from old.parent_type
     or new.parent_id   is distinct from old.parent_id
     or new.created_by  is distinct from old.created_by
     or new.assigned_by is distinct from old.assigned_by then
    raise exception 'You can change the status and the notes on your work, nothing else';
  end if;

  return new;
end $$;

-- Trigger order is alphabetical, so the guard runs before the bookkeeping.
-- That matters: the guard compares completed_at, and must see it as the caller
-- sent it rather than as sync_task_bookkeeping() would have rewritten it.
create trigger tasks_guard_ownership
  before update on public.tasks
  for each row execute function public.guard_task_ownership();

create trigger tasks_sync_bookkeeping
  before insert or update on public.tasks
  for each row execute function public.sync_task_bookkeeping();

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- log_activity() already knows this table: it was taught 'tasks' in
-- 20260817_4_04, along with the branch that renders a reassignment as two
-- names rather than two uuids.
create trigger tasks_audit
  after insert or update or delete on public.tasks
  for each row execute function public.log_activity();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;

-- Everyone sees the whole board. Who owns a piece of work is not a secret,
-- and the pending work card on a project is meant to be a shared view of what
-- is outstanding.
create policy tasks_select on public.tasks
  for select using (public.is_active_member());

-- Creating is an admin act. This is also what stops a non-admin assigning
-- work to themselves: they cannot insert at all.
create policy tasks_insert on public.tasks
  for insert with check (public.is_admin());

-- The assignee is let through here so they can move their own work along;
-- guard_task_ownership() is what limits them to status and detail.
create policy tasks_update on public.tasks
  for update using (public.is_admin() or assigned_to = auth.uid())
  with check (public.is_admin() or assigned_to = auth.uid());

create policy tasks_delete on public.tasks
  for delete using (public.is_admin());
