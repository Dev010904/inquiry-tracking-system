-- Phase 2A · 01 · activity_log gains a plain-language summary and an optional reason
--
-- Additive only. No existing column is altered, renamed or dropped, and no
-- existing row is rewritten: both new columns arrive null on the 56+ rows
-- already in the table. Nothing can be lost by this file.
--
-- `summary` is written by log_activity() (file 04) in plain English, so the feed
-- can be read without understanding the schema. `note` is a reason typed by the
-- person making the change; it stays null for everything except the handful of
-- operations routed through the noted-write functions in file 05.
--
-- The index supports the /activity feed, which is ordered newest-first and
-- filtered by actor. created_at is descending to match the read pattern exactly.

begin;

alter table public.activity_log
  add column if not exists summary text,
  add column if not exists note    text;

comment on column public.activity_log.summary is
  'Plain-language description of the change, written by log_activity(). Safe to show staff.';
comment on column public.activity_log.note is
  'Optional reason supplied by the person making the change. Set only via the noted-write functions.';

create index if not exists activity_log_created_at_desc_idx
  on public.activity_log (created_at desc);

create index if not exists activity_log_actor_created_idx
  on public.activity_log (actor_id, created_at desc);

commit;

-- Verification. Expected: two rows (summary, note), both text, both nullable;
-- and a row count identical to before the migration.
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'activity_log'
--     and column_name in ('summary', 'note');
--
--   select count(*) from public.activity_log;
