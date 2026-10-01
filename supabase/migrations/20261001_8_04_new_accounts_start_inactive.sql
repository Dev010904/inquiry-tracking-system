-- A new sign-in starts switched off until an admin switches it on.
--
-- handle_new_user() creates a profile for every row added to auth.users, and
-- the profile defaulted to is_active = true with no role — which in this app
-- means every screen except Settings. Today that is safe only because public
-- sign-up is disabled in Supabase Auth. If sign-up, an OAuth provider or an
-- invite flow were ever switched on, anyone who could create an auth user
-- would walk straight into the company's data.
--
-- After this file, an account an admin creates in Supabase (Authentication →
-- Users → Add user) appears in Settings → Staff accounts as Deactivated, and
-- the admin presses Reactivate once they have checked who it is (and, if
-- wanted, given it a role first). The Settings screen says so.
--
-- Existing accounts are not touched.

alter table public.profiles alter column is_active set default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, full_name, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    false
  )
  on conflict (id) do nothing;
  return new;
end $function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Verification:
--   select column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_active';
--   -> false
--   select count(*) from public.profiles where is_active;   -- unchanged from before
--
-- Rollback:
--   alter table public.profiles alter column is_active set default true;
--   and re-create handle_new_user() without the is_active column.
