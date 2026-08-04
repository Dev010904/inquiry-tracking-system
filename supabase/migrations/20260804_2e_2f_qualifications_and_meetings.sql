-- Phase 2E — DQ / IQ / OQ / PQ handover records.
-- Deliberately not tied to dispatch: DQ precedes manufacture, but IQ, OQ and
-- PQ all happen at the client's site after delivery. Gating dispatch on them
-- would make dispatch impossible.
create type public.qualification_stage as enum ('dq','iq','oq','pq');
create type public.qualification_status as enum ('not_started','in_progress','passed','failed');

alter table public.orders add column requires_qualification boolean not null default false;

create table public.qualifications (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders(id) on delete cascade,
  stage                   public.qualification_stage not null,
  status                  public.qualification_status not null default 'not_started',
  planned_date            date,
  performed_on            date,
  performed_by            uuid references public.profiles(id),
  customer_representative text,
  customer_signed_off     boolean not null default false,
  signed_off_on           date,
  summary                 text,
  document_path           text,
  notes                   text,
  created_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (order_id, stage),
  constraint signed_off_needs_date check (not customer_signed_off or signed_off_on is not null)
);

alter table public.qualifications enable row level security;
create policy qualifications_select on public.qualifications for select using (is_active_member());
create policy qualifications_write on public.qualifications for all using (is_active_member()) with check (is_active_member());

create trigger qualifications_updated before update on public.qualifications
  for each row execute function set_updated_at();
create trigger qualifications_audit after insert or delete or update on public.qualifications
  for each row execute function log_activity();

-- Phase 2F — meetings and minutes.
create type public.meeting_type as enum ('site_visit','review','kickoff','handover','other');

create table public.meetings (
  id                 uuid primary key default gen_random_uuid(),
  meeting_date       date not null default current_date,
  meeting_type       public.meeting_type not null default 'site_visit',
  location           text,
  company_id         uuid references public.companies(id),
  inquiry_id         uuid references public.inquiries(id),
  order_id           uuid references public.orders(id),
  subject            text not null check (length(btrim(subject)) > 0),
  internal_attendees text[] not null default '{}',
  client_attendees   text[] not null default '{}',
  agenda             text,
  discussion         text,
  decisions          text,
  next_steps         text,
  deleted_at         timestamptz,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index meetings_company_idx on public.meetings (company_id) where deleted_at is null;
create index meetings_order_idx on public.meetings (order_id) where deleted_at is null;
create index meetings_inquiry_idx on public.meetings (inquiry_id) where deleted_at is null;

create table public.meeting_actions (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  action      text not null check (length(btrim(action)) > 0),
  owner_id    uuid references public.profiles(id),
  due_on      date,
  is_done     boolean not null default false,
  done_at     timestamptz,
  followup_id uuid references public.followups(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index meeting_actions_meeting_idx on public.meeting_actions (meeting_id);

alter table public.meetings enable row level security;
alter table public.meeting_actions enable row level security;

create policy meetings_select on public.meetings for select using (is_active_member());
create policy meetings_write on public.meetings for all using (is_active_member()) with check (is_active_member());
create policy meeting_actions_select on public.meeting_actions for select using (is_active_member());
create policy meeting_actions_write on public.meeting_actions for all using (is_active_member()) with check (is_active_member());

create trigger meetings_updated before update on public.meetings
  for each row execute function set_updated_at();
create trigger meetings_guard_delete before update on public.meetings
  for each row execute function guard_soft_delete();
create trigger meetings_audit after insert or delete or update on public.meetings
  for each row execute function log_activity();
create trigger meeting_actions_updated before update on public.meeting_actions
  for each row execute function set_updated_at();

-- An action item with an owner and a due date becomes a real follow-up, so
-- it lands on the dashboard alarm panel. Minutes that live only in a
-- document are minutes nobody reads — this is what makes them worth writing.
--
-- A follow-up hangs off an inquiry, so this needs one: either the meeting's
-- own inquiry, or the inquiry behind its order. Without either, the action is
-- still recorded, just not alarmed.
create or replace function public.sync_meeting_action_followup()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  m public.meetings;
  target_inquiry uuid;
begin
  if new.owner_id is null or new.due_on is null then return new; end if;

  select * into m from public.meetings where id = new.meeting_id;
  target_inquiry := m.inquiry_id;
  if target_inquiry is null and m.order_id is not null then
    select inquiry_id into target_inquiry from public.orders where id = m.order_id;
  end if;
  if target_inquiry is null then return new; end if;

  if new.followup_id is null then
    insert into public.followups (inquiry_id, due_at, channel, note, assigned_to, created_by)
    values (
      target_inquiry,
      (new.due_on + time '10:00') at time zone 'Asia/Kolkata',
      'visit',
      'From the meeting on ' || to_char(m.meeting_date, 'DD Mon YYYY') || ': ' || new.action,
      new.owner_id,
      coalesce(m.created_by, auth.uid())
    )
    returning id into new.followup_id;
  else
    update public.followups
       set due_at = (new.due_on + time '10:00') at time zone 'Asia/Kolkata',
           assigned_to = new.owner_id,
           is_done = new.is_done,
           done_at = case when new.is_done then coalesce(new.done_at, now()) else null end
     where id = new.followup_id;
  end if;

  return new;
end $$;

create trigger meeting_actions_followup before insert or update on public.meeting_actions
  for each row execute function public.sync_meeting_action_followup();
