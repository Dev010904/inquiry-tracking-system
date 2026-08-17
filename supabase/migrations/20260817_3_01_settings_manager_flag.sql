-- Settings is restricted to named people rather than to every admin.
--
-- The flag lives on the profile rather than in application code so that a staff
-- change is a database update, not a redeploy, and so no personal email address
-- has to sit in the repository.

alter table public.profiles
  add column if not exists can_manage_settings boolean not null default false;

comment on column public.profiles.can_manage_settings is
  'May open Settings and change company details, roles and activation. Granted only by someone who already holds it.';

-- Matched on the authentication identity rather than a pasted UUID: ids are not
-- stable across a rebuild of this project, and an email can be checked by a
-- human reading this file.
update public.profiles p
set can_manage_settings = true
from auth.users u
where u.id = p.id
  and lower(u.email) in ('hp6023386@gmail.com', 'kpjadhav024@gmail.com');

/*
 * Mirrors is_admin() in shape. Deliberately NOT revoked from the API roles:
 * unlike an internal helper, this is evaluated inside RLS policies on behalf of
 * the signed-in user, and a revoke would make those policies error rather than
 * fail closed.
 */
create or replace function public.can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.can_manage_settings
  );
$$;

/*
 * Extends the existing privilege guard to cover the new flag.
 *
 * The flag check sits BEFORE the is_admin() short-circuit on purpose. Admins may
 * still change roles and activation, but an admin without the flag must not be
 * able to grant it — to anyone, including themselves. That is the whole point of
 * the restriction, and putting the check after the short-circuit would leave a
 * one-click path around it.
 *
 * This is a trigger rather than an RLS policy because a policy cannot express
 * it: WITH CHECK sees only the proposed row, so "this column did not change" is
 * not something it can state. The trigger is the enforcement; the policies below
 * cover the table the flag protects.
 */
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- auth.uid() is null for service-role / direct SQL access, which already
  -- bypasses RLS by design. Only guard real end-user sessions.
  if auth.uid() is null then
    return new;
  end if;

  if new.can_manage_settings is distinct from old.can_manage_settings
     and not public.can_manage_settings() then
    raise exception 'Only someone who can manage settings may grant or revoke that access';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an admin may change a user role';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'Only an admin may activate or deactivate a user';
  end if;

  return new;
end $function$;

-- Company details are the settings screen's one write target, so the write
-- policy moves from "any admin" to "holds the flag". There is still no insert
-- or delete policy, so those remain impossible from the API.
drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings
  for update
  using (public.can_manage_settings())
  with check (public.can_manage_settings());

/*
 * Verification — run after applying.
 *
 *   select full_name, email, role, can_manage_settings from public.profiles
 *   order by can_manage_settings desc, full_name;
 *
 * Pass condition: exactly two rows true, and they are the Dev and kpjadhav024
 * accounts. Every other staff member, admin or not, is false.
 */
