-- Attendance: who is on it, when they punched, leave, corrections, holidays and
-- the fingerprint device that sends the punches. Asked for by the owner on
-- 9 Oct 2026: "attendance tracking with all features", marked on a fingerprint
-- device, kept as a proper register that downloads to Excel.
--
-- One list of people. Nobody is an "attendance-only" user: an admin puts an
-- existing staff account on attendance and gives it the number that person is
-- enrolled under on the device (attendance_people). Only an admin can.
--
-- The fingerprint never reaches this database. A device enrols fingers itself
-- and sends only "number 1001 punched at 09:02" — fingerprints are sensitive
-- personal data under the DPDP Act 2023, and not holding them is the safest way
-- to look after them. The handshake below asks the device for attendance logs
-- only (TransFlag), never for its user or fingerprint tables.
--
-- How punches arrive:
--   * a network device pushes them live over ZKTeco's ADMS ("cloud server")
--     protocol to /iclock/* on the app, which calls attendance_device_hello()
--     and attendance_device_push() with the public key. Those two functions are
--     the only things the anonymous key may run (8_01 gave it nothing else);
--     each refuses any device an admin has not approved, and a token can be
--     required on top.
--   * a USB-only device's export is uploaded by an admin (attendance_import_punches)
--   * an admin adds one by hand, with a reason (attendance_add_manual_punch)
--   * an approved correction request adds the missed punch
--     (attendance_decide_correction)
--
-- Times: a device has no time zone; its clock is set to India time, so its
-- "2026-10-09 09:02:13" is read as Asia/Kolkata. Everything is stored as
-- timestamptz.
--
-- Nothing existing is changed except: 'attendance' joins the grantable feature
-- keys, and the two system roles (Administrator, Staff) are granted it, so the
-- one staff account can see their own attendance and apply for leave. Managing
-- attendance — people, devices, approvals, corrections — is is_admin() only,
-- whatever a role says.
--
-- Changes made by people are written to activity_log under table_name
-- 'attendance' (one section in Recent changes). Leave and correction reasons
-- are left out of the log: they can be personal ("hospital").

-- ---------------------------------------------------------------------------
-- 1. The feature key
-- ---------------------------------------------------------------------------

alter table public.role_features drop constraint role_features_key_grantable;
alter table public.role_features add constraint role_features_key_grantable
  check (feature_key = any (array['dashboard', 'inquiries', 'orders', 'rnd', 'ip', 'documents',
                                  'meetings', 'companies', 'activity', 'reports', 'payments',
                                  'attendance']));

insert into public.role_features (role_id, feature_key, can_view, can_edit)
select r.id, 'attendance', true, true
  from public.roles r
 where r.is_system
on conflict (role_id, feature_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- A device sends "0001" or "1" depending on how it was enrolled. Numbers are
-- compared without leading zeros, letters without case.
create or replace function public.attendance_norm_code(p_code text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when btrim(p_code) ~ '^[0-9]+$' then coalesce(nullif(ltrim(btrim(p_code), '0'), ''), '0')
    else upper(btrim(p_code))
  end;
$function$;

create table public.attendance_shifts (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  start_time              time not null,
  end_time                time not null,
  grace_minutes           integer not null default 15,
  half_day_minutes        integer not null default 240,
  full_day_minutes        integer not null default 420,
  -- ISO weekdays: 1 = Monday … 7 = Sunday.
  weekly_offs             smallint[] not null default '{7}',
  -- 0 = off. 3 means every third late arrival in a month costs half a day.
  late_marks_per_half_day integer not null default 0,
  overtime_after_minutes  integer not null default 30,
  is_default              boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint attendance_shifts_name_key unique (name),
  constraint attendance_shifts_name_len check (char_length(btrim(name)) between 2 and 40),
  -- Day shifts only for now: a shift that crosses midnight needs its punches
  -- dated to the day it started, which nothing here does yet.
  constraint attendance_shifts_day_shift check (end_time > start_time),
  constraint attendance_shifts_grace check (grace_minutes between 0 and 240),
  constraint attendance_shifts_half check (half_day_minutes between 0 and 1440),
  constraint attendance_shifts_full check (full_day_minutes between 1 and 1440),
  constraint attendance_shifts_half_before_full check (half_day_minutes <= full_day_minutes),
  constraint attendance_shifts_offs check (weekly_offs <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  constraint attendance_shifts_late_rule check (late_marks_per_half_day between 0 and 31),
  constraint attendance_shifts_ot check (overtime_after_minutes between 0 and 600)
);
create unique index attendance_shifts_one_default on public.attendance_shifts (is_default) where is_default;

insert into public.attendance_shifts (name, start_time, end_time, is_default)
values ('General', '09:30', '18:30', true);

create table public.attendance_people (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id),
  -- The number this person is enrolled under on the device.
  device_code  text not null,
  shift_id     uuid not null references public.attendance_shifts(id),
  -- Days before this are not counted (no "absent" before someone joined).
  tracked_from date not null default (now() at time zone 'Asia/Kolkata')::date,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint attendance_people_profile_key unique (profile_id),
  constraint attendance_people_code_key unique (device_code),
  constraint attendance_people_code_format check (device_code ~ '^[0-9A-Za-z]{1,24}$'),
  constraint attendance_people_code_normal check (device_code = public.attendance_norm_code(device_code))
);

create table public.attendance_devices (
  id             uuid primary key default gen_random_uuid(),
  serial_no      text not null,
  name           text not null default 'Attendance device',
  -- pending: it has called in but nobody has approved it; its punches are
  -- refused (the device keeps them and sends them again once approved).
  status         text not null default 'pending',
  push_token     text not null default replace(gen_random_uuid()::text, '-', ''),
  token_required boolean not null default false,
  attlog_stamp   text,
  last_seen_at   timestamptz,
  last_ip        text,
  last_info      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint attendance_devices_serial_key unique (serial_no),
  constraint attendance_devices_serial_format check (serial_no ~ '^[0-9A-Za-z_-]{3,40}$'),
  constraint attendance_devices_status check (status in ('pending', 'active', 'blocked')),
  constraint attendance_devices_name_len check (char_length(btrim(name)) between 2 and 60)
);

create table public.attendance_punches (
  id          uuid primary key default gen_random_uuid(),
  -- Null while nobody is on attendance with this device number.
  person_id   uuid references public.attendance_people(id),
  device_code text not null,
  punched_at  timestamptz not null,
  source      text not null,
  device_id   uuid references public.attendance_devices(id) on delete set null,
  verify_mode smallint,
  punch_state smallint,
  note        text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  constraint attendance_punches_source check (source in ('device', 'import', 'manual', 'correction')),
  constraint attendance_punches_note_len check (note is null or char_length(note) <= 300),
  constraint attendance_punches_reason check (source in ('device', 'import') or char_length(btrim(coalesce(note, ''))) >= 3)
);
-- A device sends its logs again after a restart, and an export overlaps what
-- the device already pushed: the same number at the same second is one punch.
create unique index attendance_punches_once on public.attendance_punches (device_code, punched_at)
  where source in ('device', 'import');
create index attendance_punches_person_time on public.attendance_punches (person_id, punched_at);
create index attendance_punches_unmatched on public.attendance_punches (device_code) where person_id is null;

create table public.attendance_holidays (
  id         uuid primary key default gen_random_uuid(),
  holiday_on date not null,
  name       text not null,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_holidays_day_key unique (holiday_on),
  constraint attendance_holidays_name_len check (char_length(btrim(name)) between 2 and 80)
);

create table public.attendance_leave_types (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  name              text not null,
  is_paid           boolean not null default true,
  -- On duty: out of the office for work (a site visit, a client meeting). It is
  -- requested and approved like leave, but the day counts as present.
  counts_as_present boolean not null default false,
  -- Days a financial year; null = no limit.
  yearly_quota      numeric(5, 1),
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint attendance_leave_types_code_key unique (code),
  constraint attendance_leave_types_code_format check (code ~ '^[A-Z]{1,5}$'),
  constraint attendance_leave_types_name_len check (char_length(btrim(name)) between 2 and 60),
  constraint attendance_leave_types_quota check (yearly_quota is null or yearly_quota between 0 and 366)
);

-- Common Indian defaults; the admin changes them on the Setup screen.
insert into public.attendance_leave_types (code, name, is_paid, counts_as_present, yearly_quota, sort_order) values
  ('CL',  'Casual leave',                    true,  false, 12,   1),
  ('SL',  'Sick leave',                      true,  false, 6,    2),
  ('EL',  'Earned leave',                    true,  false, 15,   3),
  ('OD',  'On duty (site or client visit)',  true,  true,  null, 4),
  ('LWP', 'Leave without pay',               false, false, null, 5);

create table public.attendance_leaves (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.attendance_people(id),
  leave_type_id uuid not null references public.attendance_leave_types(id),
  from_date     date not null,
  to_date       date not null,
  half_day      boolean not null default false,
  reason        text,
  status        text not null default 'pending',
  requested_by  uuid not null references public.profiles(id) default auth.uid(),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint attendance_leaves_status check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint attendance_leaves_order check (to_date >= from_date),
  constraint attendance_leaves_half check (not half_day or from_date = to_date),
  constraint attendance_leaves_span check (to_date - from_date <= 90),
  constraint attendance_leaves_reason_len check (reason is null or char_length(reason) <= 500),
  constraint attendance_leaves_note_len check (decision_note is null or char_length(decision_note) <= 300)
);
create index attendance_leaves_person on public.attendance_leaves (person_id, from_date);

create table public.attendance_corrections (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.attendance_people(id),
  work_date     date not null,
  punch_in      time,
  punch_out     time,
  reason        text not null,
  status        text not null default 'pending',
  requested_by  uuid not null references public.profiles(id) default auth.uid(),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint attendance_corrections_status check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint attendance_corrections_something check (punch_in is not null or punch_out is not null),
  constraint attendance_corrections_order check (punch_in is null or punch_out is null or punch_out > punch_in),
  constraint attendance_corrections_reason_len check (char_length(btrim(reason)) between 3 and 500),
  constraint attendance_corrections_note_len check (decision_note is null or char_length(decision_note) <= 300)
);
create index attendance_corrections_person on public.attendance_corrections (person_id, work_date);

-- An admin's ruling on one person's day, which wins over whatever the punches say.
create table public.attendance_day_overrides (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.attendance_people(id),
  work_date     date not null,
  status        text not null,
  leave_type_id uuid references public.attendance_leave_types(id),
  note          text not null,
  created_by    uuid not null references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint attendance_day_overrides_day_key unique (person_id, work_date),
  constraint attendance_day_overrides_status check (status in ('present', 'half_day', 'absent', 'leave', 'on_duty', 'holiday', 'weekly_off')),
  constraint attendance_day_overrides_leave check ((status = 'leave') = (leave_type_id is not null)),
  constraint attendance_day_overrides_note_len check (char_length(btrim(note)) between 3 and 300)
);

-- ---------------------------------------------------------------------------
-- 3. Bookkeeping triggers
-- ---------------------------------------------------------------------------

create trigger attendance_shifts_updated       before update on public.attendance_shifts       for each row execute function public.set_updated_at();
create trigger attendance_people_updated       before update on public.attendance_people       for each row execute function public.set_updated_at();
create trigger attendance_devices_updated      before update on public.attendance_devices      for each row execute function public.set_updated_at();
create trigger attendance_holidays_updated     before update on public.attendance_holidays     for each row execute function public.set_updated_at();
create trigger attendance_leave_types_updated  before update on public.attendance_leave_types  for each row execute function public.set_updated_at();
create trigger attendance_leaves_updated       before update on public.attendance_leaves       for each row execute function public.set_updated_at();
create trigger attendance_corrections_updated  before update on public.attendance_corrections  for each row execute function public.set_updated_at();
create trigger attendance_day_overrides_updated before update on public.attendance_day_overrides for each row execute function public.set_updated_at();

-- Punches that arrived before anyone was given their number are claimed the
-- moment someone is.
create or replace function public.attendance_claim_punches()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.attendance_punches
     set person_id = new.id
   where person_id is null
     and device_code = new.device_code;
  return new;
end $function$;

create trigger attendance_people_claim
  after insert or update of device_code on public.attendance_people
  for each row execute function public.attendance_claim_punches();

-- Two leave requests may not cover the same day.
create or replace function public.attendance_guard_leave_overlap()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status in ('pending', 'approved') and exists (
    select 1
      from public.attendance_leaves l
     where l.person_id = new.person_id
       and l.id <> new.id
       and l.status in ('pending', 'approved')
       and l.from_date <= new.to_date
       and l.to_date >= new.from_date
  ) then
    raise exception 'There is already a leave request for some of these days.';
  end if;
  return new;
end $function$;

create trigger attendance_leaves_no_overlap
  before insert or update of from_date, to_date, status, person_id on public.attendance_leaves
  for each row execute function public.attendance_guard_leave_overlap();

-- ---------------------------------------------------------------------------
-- 4. Audit: one "Attendance" section in Recent changes
-- ---------------------------------------------------------------------------

create or replace function public.log_attendance_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       jsonb := to_jsonb(coalesce(new, old));
  d       jsonb;
  who     text;
  what    text;
  verb    text;
  detail  text := '';
  s_from  text := null;
  s_to    text := null;
  changed text;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into d
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'last_seen_at', 'last_ip', 'last_info', 'attlog_stamp');
    -- A device calling in is not a change anyone made.
    if d is null or d = '{}'::jsonb then return new; end if;
    if d ? 'status' then
      s_from := d->'status'->>'from';
      s_to   := d->'status'->>'to';
    end if;
  end if;

  if tg_table_name = 'attendance_people' then
    select p.full_name into who from public.profiles p where p.id = (r->>'profile_id')::uuid;
  elsif r ? 'person_id' then
    select p.full_name into who
      from public.attendance_people a
      join public.profiles p on p.id = a.profile_id
     where a.id = (r->>'person_id')::uuid;
  end if;
  who := coalesce(who, 'someone');

  what := case tg_table_name
    when 'attendance_people'        then who || ' on attendance (device no. ' || (r->>'device_code') || ')'
    when 'attendance_devices'       then 'Attendance device '
                                         || case when r->>'name' = 'Attendance device' then r->>'serial_no'
                                                 else (r->>'name') || ' (' || (r->>'serial_no') || ')' end
    when 'attendance_shifts'        then 'Shift ' || (r->>'name')
    when 'attendance_holidays'      then 'Holiday ' || (r->>'name') || ' on ' || to_char((r->>'holiday_on')::date, 'DD Mon YYYY')
    when 'attendance_leave_types'   then 'Leave type ' || (r->>'code') || ' (' || (r->>'name') || ')'
    when 'attendance_leaves'        then 'Leave for ' || who || ', '
                                         || to_char((r->>'from_date')::date, 'DD Mon')
                                         || case when r->>'to_date' <> r->>'from_date'
                                                 then ' to ' || to_char((r->>'to_date')::date, 'DD Mon') else '' end
                                         || to_char((r->>'from_date')::date, ' YYYY')
                                         || case when (r->>'half_day')::boolean then ' (half day)' else '' end
    when 'attendance_corrections'   then 'Punch correction for ' || who || ' on ' || to_char((r->>'work_date')::date, 'DD Mon YYYY')
    when 'attendance_day_overrides' then 'Attendance of ' || who || ' on ' || to_char((r->>'work_date')::date, 'DD Mon YYYY')
                                         || ' marked ' || replace(r->>'status', '_', ' ')
    when 'attendance_punches'       then initcap(r->>'source') || ' punch for ' || who || ' at '
                                         || to_char(((r->>'punched_at')::timestamptz at time zone 'Asia/Kolkata'), 'DD Mon YYYY, HH12:MI am')
    else tg_table_name
  end;

  verb := case tg_op when 'INSERT' then 'added' when 'DELETE' then 'removed' else 'updated' end;

  if tg_op = 'UPDATE' then
    if s_to is not null then
      detail := ' — ' || replace(coalesce(s_from, '?'), '_', ' ') || ' to ' || replace(s_to, '_', ' ');
    else
      select ' — changed: ' || string_agg(replace(k, '_', ' '), ', ' order by k)
        into changed
        from jsonb_object_keys(d) k
       where k not in ('reason', 'decision_note', 'note');
      detail := coalesce(changed, '');
    end if;
  end if;

  insert into public.activity_log (table_name, row_id, action, actor_id, diff, summary, status_from, status_to)
  values ('attendance', (r->>'id')::uuid, lower(tg_op), auth.uid(),
          (case when tg_op = 'UPDATE' then d else r end) - 'reason' - 'decision_note' - 'note' - 'push_token'
            || jsonb_build_object('kind', tg_table_name),
          trim(what || ' ' || verb || detail), s_from, s_to);

  return coalesce(new, old);
end $function$;

create trigger attendance_people_audit        after insert or update or delete on public.attendance_people        for each row execute function public.log_attendance_activity();
create trigger attendance_devices_audit       after insert or update or delete on public.attendance_devices       for each row execute function public.log_attendance_activity();
create trigger attendance_shifts_audit        after insert or update or delete on public.attendance_shifts        for each row execute function public.log_attendance_activity();
create trigger attendance_holidays_audit      after insert or update or delete on public.attendance_holidays      for each row execute function public.log_attendance_activity();
create trigger attendance_leave_types_audit   after insert or update or delete on public.attendance_leave_types   for each row execute function public.log_attendance_activity();
create trigger attendance_leaves_audit        after insert or update or delete on public.attendance_leaves        for each row execute function public.log_attendance_activity();
create trigger attendance_corrections_audit   after insert or update or delete on public.attendance_corrections   for each row execute function public.log_attendance_activity();
create trigger attendance_day_overrides_audit after insert or update or delete on public.attendance_day_overrides for each row execute function public.log_attendance_activity();
-- Device and imported punches are not audited one by one; a person's are.
create trigger attendance_punches_audit_insert after insert on public.attendance_punches
  for each row when (new.source in ('manual', 'correction')) execute function public.log_attendance_activity();
create trigger attendance_punches_audit_delete after delete on public.attendance_punches
  for each row when (old.source in ('manual', 'correction')) execute function public.log_attendance_activity();

-- ---------------------------------------------------------------------------
-- 5. Who may see and do what
-- ---------------------------------------------------------------------------

-- The signed-in person's place on attendance, if they have one.
create or replace function public.attendance_my_person_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.id from public.attendance_people a
   where a.profile_id = auth.uid() and public.is_active_member();
$function$;

alter table public.attendance_shifts        enable row level security;
alter table public.attendance_people        enable row level security;
alter table public.attendance_devices       enable row level security;
alter table public.attendance_punches       enable row level security;
alter table public.attendance_holidays      enable row level security;
alter table public.attendance_leave_types   enable row level security;
alter table public.attendance_leaves        enable row level security;
alter table public.attendance_corrections   enable row level security;
alter table public.attendance_day_overrides enable row level security;

-- Reference data everyone on attendance needs to read their own month.
create policy attendance_shifts_select on public.attendance_shifts for select to authenticated
  using ((select public.has_feature('attendance')));
create policy attendance_shifts_write on public.attendance_shifts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy attendance_holidays_select on public.attendance_holidays for select to authenticated
  using ((select public.has_feature('attendance')));
create policy attendance_holidays_write on public.attendance_holidays for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy attendance_leave_types_select on public.attendance_leave_types for select to authenticated
  using ((select public.has_feature('attendance')));
create policy attendance_leave_types_write on public.attendance_leave_types for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- People: an admin sees and manages everyone; anyone else sees their own row.
create policy attendance_people_select on public.attendance_people for select to authenticated
  using ((select public.is_admin())
         or (profile_id = (select auth.uid()) and (select public.has_feature('attendance'))));
create policy attendance_people_write on public.attendance_people for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy attendance_devices_all on public.attendance_devices for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Punches are read here and written only through the functions below.
create policy attendance_punches_select on public.attendance_punches for select to authenticated
  using ((select public.is_admin())
         or (person_id = (select public.attendance_my_person_id()) and (select public.has_feature('attendance'))));

-- Leave and corrections: your own, or everyone's for an admin. A request is
-- raised directly (always pending); deciding and cancelling go through functions.
create policy attendance_leaves_select on public.attendance_leaves for select to authenticated
  using ((select public.is_admin())
         or (person_id = (select public.attendance_my_person_id()) and (select public.has_feature('attendance'))));
create policy attendance_leaves_insert on public.attendance_leaves for insert to authenticated
  with check (status = 'pending'
              and requested_by = (select auth.uid())
              and ((select public.is_admin())
                   or (person_id = (select public.attendance_my_person_id())
                       and (select public.has_feature('attendance', true)))));

create policy attendance_corrections_select on public.attendance_corrections for select to authenticated
  using ((select public.is_admin())
         or (person_id = (select public.attendance_my_person_id()) and (select public.has_feature('attendance'))));
create policy attendance_corrections_insert on public.attendance_corrections for insert to authenticated
  with check (status = 'pending'
              and requested_by = (select auth.uid())
              and ((select public.is_admin())
                   or (person_id = (select public.attendance_my_person_id())
                       and (select public.has_feature('attendance', true)))));

create policy attendance_day_overrides_select on public.attendance_day_overrides for select to authenticated
  using ((select public.is_admin())
         or (person_id = (select public.attendance_my_person_id()) and (select public.has_feature('attendance'))));
create policy attendance_day_overrides_write on public.attendance_day_overrides for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Column grants (the 8_02 rule: write only what the app writes).
revoke all on public.attendance_shifts, public.attendance_people, public.attendance_devices,
              public.attendance_punches, public.attendance_holidays, public.attendance_leave_types,
              public.attendance_leaves, public.attendance_corrections, public.attendance_day_overrides
  from anon, authenticated;

grant select on public.attendance_shifts, public.attendance_people, public.attendance_devices,
                public.attendance_punches, public.attendance_holidays, public.attendance_leave_types,
                public.attendance_leaves, public.attendance_corrections, public.attendance_day_overrides
  to authenticated;

grant insert (name, start_time, end_time, grace_minutes, half_day_minutes, full_day_minutes,
              weekly_offs, late_marks_per_half_day, overtime_after_minutes)
  on public.attendance_shifts to authenticated;
grant update (name, start_time, end_time, grace_minutes, half_day_minutes, full_day_minutes,
              weekly_offs, late_marks_per_half_day, overtime_after_minutes)
  on public.attendance_shifts to authenticated;
grant delete on public.attendance_shifts to authenticated;

grant insert (profile_id, device_code, shift_id, tracked_from, is_active) on public.attendance_people to authenticated;
grant update (device_code, shift_id, tracked_from, is_active)            on public.attendance_people to authenticated;
grant delete on public.attendance_people to authenticated;

grant insert (serial_no, name, status, token_required) on public.attendance_devices to authenticated;
grant update (name, status, token_required)            on public.attendance_devices to authenticated;
grant delete on public.attendance_devices to authenticated;

grant insert (holiday_on, name) on public.attendance_holidays to authenticated;
grant update (holiday_on, name) on public.attendance_holidays to authenticated;
grant delete on public.attendance_holidays to authenticated;

grant insert (code, name, is_paid, counts_as_present, yearly_quota, is_active, sort_order) on public.attendance_leave_types to authenticated;
grant update (name, is_paid, counts_as_present, yearly_quota, is_active, sort_order)      on public.attendance_leave_types to authenticated;
grant delete on public.attendance_leave_types to authenticated;

grant insert (person_id, leave_type_id, from_date, to_date, half_day, reason) on public.attendance_leaves to authenticated;
grant insert (person_id, work_date, punch_in, punch_out, reason)             on public.attendance_corrections to authenticated;

grant insert (person_id, work_date, status, leave_type_id, note) on public.attendance_day_overrides to authenticated;
grant update (status, leave_type_id, note)                       on public.attendance_day_overrides to authenticated;
grant delete on public.attendance_day_overrides to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Functions the app calls
-- ---------------------------------------------------------------------------

-- Approve or reject a leave request; an admin may also cancel an approved one
-- (p_approve null = cancel).
create or replace function public.attendance_decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l public.attendance_leaves;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can decide leave.';
  end if;
  select * into l from public.attendance_leaves where id = p_id for update;
  if not found then raise exception 'That leave request no longer exists.'; end if;

  if p_approve is null then
    if l.status not in ('pending', 'approved') then
      raise exception 'Only a pending or approved leave can be cancelled.';
    end if;
    update public.attendance_leaves
       set status = 'cancelled', decided_by = auth.uid(), decided_at = now(),
           decision_note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_id;
    return;
  end if;

  if l.status <> 'pending' then
    raise exception 'This leave request has already been decided.';
  end if;
  update public.attendance_leaves
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
end $function$;

-- Approve (adds the missed punches) or reject a correction request.
create or replace function public.attendance_decide_correction(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c    public.attendance_corrections;
  code text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can decide a correction.';
  end if;
  select * into c from public.attendance_corrections where id = p_id for update;
  if not found then raise exception 'That correction request no longer exists.'; end if;
  if c.status <> 'pending' then
    raise exception 'This correction has already been decided.';
  end if;

  update public.attendance_corrections
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;

  if p_approve then
    select a.device_code into code from public.attendance_people a where a.id = c.person_id;
    if c.punch_in is not null then
      insert into public.attendance_punches (person_id, device_code, punched_at, source, note, created_by)
      values (c.person_id, code, (c.work_date + c.punch_in) at time zone 'Asia/Kolkata', 'correction',
              left('Correction: ' || c.reason, 300), auth.uid());
    end if;
    if c.punch_out is not null then
      insert into public.attendance_punches (person_id, device_code, punched_at, source, note, created_by)
      values (c.person_id, code, (c.work_date + c.punch_out) at time zone 'Asia/Kolkata', 'correction',
              left('Correction: ' || c.reason, 300), auth.uid());
    end if;
  end if;
end $function$;

-- The person who asked (or an admin) withdraws a request still waiting.
create or replace function public.attendance_cancel_request(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  owner uuid;
  st    text;
begin
  if p_kind = 'leave' then
    select requested_by, status into owner, st from public.attendance_leaves where id = p_id for update;
  elsif p_kind = 'correction' then
    select requested_by, status into owner, st from public.attendance_corrections where id = p_id for update;
  else
    raise exception 'Unknown request.';
  end if;
  if owner is null then raise exception 'That request no longer exists.'; end if;
  if not (public.is_admin() or (owner = auth.uid() and public.is_active_member())) then
    raise exception 'Only the person who asked can withdraw this request.';
  end if;
  if st <> 'pending' then
    raise exception 'Only a request that is still waiting can be withdrawn.';
  end if;
  if p_kind = 'leave' then
    update public.attendance_leaves set status = 'cancelled' where id = p_id;
  else
    update public.attendance_corrections set status = 'cancelled' where id = p_id;
  end if;
end $function$;

-- An admin adds a punch by hand (the device was down, someone forgot to punch).
create or replace function public.attendance_add_manual_punch(p_person uuid, p_at timestamptz, p_note text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  code text;
  pid  uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can add a punch.';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why this punch is being added.';
  end if;
  if p_at > now() + interval '5 minutes' then
    raise exception 'A punch cannot be in the future.';
  end if;
  select a.device_code into code from public.attendance_people a where a.id = p_person;
  if code is null then raise exception 'That person is not on attendance.'; end if;

  insert into public.attendance_punches (person_id, device_code, punched_at, source, note, created_by)
  values (p_person, code, p_at, 'manual', left(btrim(p_note), 300), auth.uid())
  returning id into pid;
  return pid;
end $function$;

-- An admin removes a punch added by hand or by a correction. Device and
-- imported punches are the record of what happened and stay.
create or replace function public.attendance_delete_punch(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  src text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can remove a punch.';
  end if;
  select source into src from public.attendance_punches where id = p_id;
  if src is null then raise exception 'That punch no longer exists.'; end if;
  if src in ('device', 'import') then
    raise exception 'A punch from the device cannot be removed. Mark the day instead.';
  end if;
  delete from public.attendance_punches where id = p_id;
end $function$;

-- An admin uploads a USB-only device's export: [{c: number, t: 'YYYY-MM-DD HH:MM:SS'}, …]
create or replace function public.attendance_import_punches(p_rows jsonb, p_label text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e        jsonb;
  code     text;
  at       timestamptz;
  inserted integer := 0;
  invalid  integer := 0;
  n        integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can import punches.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then
    raise exception 'The file has too many rows to import at once.';
  end if;

  for e in select * from jsonb_array_elements(p_rows) loop
    begin
      code := public.attendance_norm_code(e->>'c');
      at   := (e->>'t')::timestamp at time zone 'Asia/Kolkata';
      if code !~ '^[0-9A-Za-z]{1,24}$' or at < '2020-01-01' or at > now() + interval '1 day' then
        invalid := invalid + 1;
        continue;
      end if;
      insert into public.attendance_punches (person_id, device_code, punched_at, source, note, created_by)
      values ((select a.id from public.attendance_people a where a.device_code = code),
              code, at, 'import', left(nullif(btrim(coalesce(p_label, '')), ''), 300), auth.uid())
      on conflict do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
    exception when others then
      invalid := invalid + 1;
    end;
  end loop;

  return jsonb_build_object('inserted', inserted, 'invalid', invalid,
                            'duplicates', jsonb_array_length(p_rows) - inserted - invalid);
end $function$;

-- ---------------------------------------------------------------------------
-- 7. The device's two calls (the only things the anonymous key may run)
-- ---------------------------------------------------------------------------

-- A device says hello: remember it (pending until an admin approves it) and
-- tell it how far its logs have been received.
create or replace function public.attendance_device_hello(p_serial text, p_token text, p_ip text, p_info text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  dev public.attendance_devices;
begin
  if p_serial is null or p_serial !~ '^[0-9A-Za-z_-]{3,40}$' then
    return jsonb_build_object('status', 'rejected');
  end if;

  select * into dev from public.attendance_devices where serial_no = p_serial;
  if not found then
    -- A cap, so the public endpoint cannot be used to fill the table.
    if (select count(*) from public.attendance_devices where status = 'pending') >= 10 then
      return jsonb_build_object('status', 'rejected');
    end if;
    insert into public.attendance_devices (serial_no, last_seen_at, last_ip, last_info)
    values (p_serial, now(), left(p_ip, 60), left(p_info, 300))
    on conflict (serial_no) do nothing
    returning * into dev;
    if not found then
      select * into dev from public.attendance_devices where serial_no = p_serial;
    end if;
    return jsonb_build_object('status', coalesce(dev.status, 'pending'), 'stamp', null);
  end if;

  if dev.token_required and p_token is distinct from dev.push_token then
    return jsonb_build_object('status', 'rejected');
  end if;

  update public.attendance_devices
     set last_seen_at = now(), last_ip = left(p_ip, 60),
         last_info = coalesce(left(p_info, 300), last_info)
   where id = dev.id;

  return jsonb_build_object('status', dev.status, 'stamp', dev.attlog_stamp);
end $function$;

-- A device sends punches: [{c: number, t: 'YYYY-MM-DD HH:MM:SS', s: state, v: verify}, …]
-- Returns how many were new, or -1 when the device may not send.
create or replace function public.attendance_device_push(p_serial text, p_token text, p_ip text, p_stamp text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  dev      public.attendance_devices;
  e        jsonb;
  code     text;
  at       timestamptz;
  inserted integer := 0;
  n        integer;
begin
  select * into dev from public.attendance_devices where serial_no = p_serial;
  if not found or dev.status <> 'active' then return -1; end if;
  if dev.token_required and p_token is distinct from dev.push_token then return -1; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then return -1; end if;

  for e in select * from jsonb_array_elements(p_rows) loop
    begin
      code := public.attendance_norm_code(e->>'c');
      at   := (e->>'t')::timestamp at time zone 'Asia/Kolkata';
      if code !~ '^[0-9A-Za-z]{1,24}$' or at < '2020-01-01' or at > now() + interval '1 day' then
        continue;
      end if;
      insert into public.attendance_punches (person_id, device_code, punched_at, source, device_id, punch_state, verify_mode)
      values ((select a.id from public.attendance_people a where a.device_code = code),
              code, at, 'device', dev.id,
              case when (e->>'s') ~ '^[0-9]{1,3}$' then (e->>'s')::smallint end,
              case when (e->>'v') ~ '^[0-9]{1,3}$' then (e->>'v')::smallint end)
      on conflict do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
    exception when others then
      continue;
    end;
  end loop;

  update public.attendance_devices
     set last_seen_at = now(), last_ip = left(p_ip, 60),
         attlog_stamp = case when p_stamp ~ '^[0-9]{1,20}$' then p_stamp else attlog_stamp end
   where id = dev.id;

  return inserted;
end $function$;

-- The 8_01 rule: start from nothing, grant what is used.
revoke all on function public.attendance_norm_code(text)                                   from public, anon, authenticated;
revoke all on function public.attendance_claim_punches()                                   from public, anon, authenticated;
revoke all on function public.attendance_guard_leave_overlap()                             from public, anon, authenticated;
revoke all on function public.log_attendance_activity()                                    from public, anon, authenticated;
revoke all on function public.attendance_my_person_id()                                    from public, anon, authenticated;
revoke all on function public.attendance_decide_leave(uuid, boolean, text)                 from public, anon, authenticated;
revoke all on function public.attendance_decide_correction(uuid, boolean, text)            from public, anon, authenticated;
revoke all on function public.attendance_cancel_request(text, uuid)                        from public, anon, authenticated;
revoke all on function public.attendance_add_manual_punch(uuid, timestamptz, text)         from public, anon, authenticated;
revoke all on function public.attendance_delete_punch(uuid)                                from public, anon, authenticated;
revoke all on function public.attendance_import_punches(jsonb, text)                       from public, anon, authenticated;
revoke all on function public.attendance_device_hello(text, text, text, text)              from public, anon, authenticated;
revoke all on function public.attendance_device_push(text, text, text, text, jsonb)        from public, anon, authenticated;

grant execute on function public.attendance_norm_code(text)                           to authenticated;
grant execute on function public.attendance_my_person_id()                            to authenticated;
grant execute on function public.attendance_decide_leave(uuid, boolean, text)         to authenticated;
grant execute on function public.attendance_decide_correction(uuid, boolean, text)    to authenticated;
grant execute on function public.attendance_cancel_request(text, uuid)                to authenticated;
grant execute on function public.attendance_add_manual_punch(uuid, timestamptz, text) to authenticated;
grant execute on function public.attendance_delete_punch(uuid)                        to authenticated;
grant execute on function public.attendance_import_punches(jsonb, text)               to authenticated;
grant execute on function public.attendance_device_hello(text, text, text, text)       to anon;
grant execute on function public.attendance_device_push(text, text, text, text, jsonb) to anon;

-- Verification (pass conditions in the comments):
--   select count(*) from information_schema.tables
--    where table_schema = 'public' and table_name like 'attendance\_%';           -- 9
--   select name, is_default from public.attendance_shifts;                         -- General, true
--   select code from public.attendance_leave_types order by sort_order;            -- CL SL EL OD LWP
--   select r.name, f.can_view, f.can_edit from public.role_features f
--     join public.roles r on r.id = f.role_id where f.feature_key = 'attendance';  -- 2 rows, true/true
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
--     -- exactly attendance_device_hello and attendance_device_push
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name like 'attendance\_%' and grantee = 'anon';                  -- 0 rows
--
-- Rollback (nothing else depends on these objects):
--   drop table public.attendance_day_overrides, public.attendance_corrections, public.attendance_leaves,
--     public.attendance_punches, public.attendance_people, public.attendance_devices,
--     public.attendance_holidays, public.attendance_leave_types, public.attendance_shifts cascade;
--   drop function public.attendance_device_push(text, text, text, text, jsonb), public.attendance_device_hello(text, text, text, text),
--     public.attendance_import_punches(jsonb, text), public.attendance_delete_punch(uuid),
--     public.attendance_add_manual_punch(uuid, timestamptz, text), public.attendance_cancel_request(text, uuid),
--     public.attendance_decide_correction(uuid, boolean, text), public.attendance_decide_leave(uuid, boolean, text),
--     public.attendance_my_person_id(), public.log_attendance_activity(), public.attendance_guard_leave_overlap(),
--     public.attendance_claim_punches(), public.attendance_norm_code(text);
--   delete from public.role_features where feature_key = 'attendance';
--   alter table public.role_features drop constraint role_features_key_grantable;
--   alter table public.role_features add constraint role_features_key_grantable check (feature_key = any (array[
--     'dashboard','inquiries','orders','rnd','ip','documents','meetings','companies','activity','reports','payments']));
--   delete from public.activity_log where table_name = 'attendance';   -- only if the audit should go too
