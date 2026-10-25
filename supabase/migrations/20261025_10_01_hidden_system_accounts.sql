-- A system account is a normal, working login that is left out of every list of
-- people in the app: Settings > Users, and the pickers for inquiry owners, task
-- assignees, meeting owners, R&D leads, the activity filter and attendance setup.
-- Wherever it has already acted, its name still shows, so history stays readable.
--
-- The flag is set from SQL only. No screen writes it, and it sits outside the
-- profile UPDATE column grant from 8_02, so nobody can set or clear it on their
-- own row through the API.
--
-- No existing data changes except the one account marked below.

alter table public.profiles add column if not exists is_hidden boolean not null default false;

comment on column public.profiles.is_hidden is
  'System account: works normally but is not listed in Settings or any people picker. Set from SQL only.';

update public.profiles set is_hidden = true where id = '4273be40-653d-4006-9e6c-6c007706fd2f';

-- Verification:
--   select full_name, role, is_active, is_hidden from public.profiles order by is_hidden desc, full_name;
--   -> exactly one row has is_hidden = true (System Admin); every other row is false.
--   select privilege_type, column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
--      and column_name = 'is_hidden';
--   -> SELECT only, no UPDATE.
--
-- Applied 25 Oct 2026: the column and comment as migration
-- 20261025_10_01_hidden_system_accounts, the account update separately, and the
-- one audit line that update wrote removed. Checked: one hidden row, SELECT-only
-- grant, activity_log row count unchanged.
--
-- Rollback:
--   alter table public.profiles drop column if exists is_hidden;
