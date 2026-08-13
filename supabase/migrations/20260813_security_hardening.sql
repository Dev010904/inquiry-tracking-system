-- Security hardening after the Phase 2 build.
--
-- Phase 1 pinned search_path on every function and kept trigger functions out
-- of the REST API. The Phase 2 functions were added without either protection.
-- This restores the standard across the whole schema.
--
-- The important correction: revoking from `anon` alone does nothing. Postgres
-- grants EXECUTE to PUBLIC on every new function and anon belongs to PUBLIC,
-- so the grant has to be removed from PUBLIC and handed back only to the roles
-- that need it.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path to ''public''', f.sig);
  end loop;

  -- Trigger functions are fired by the database, never called by a person.
  -- Postgres checks EXECUTE when a trigger is created, not when it fires, so
  -- removing the grant cannot break an existing trigger.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and pg_get_function_result(p.oid) = 'trigger'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Business operations: signed-in staff only.
--
-- allocate_document_number was the sharp one — callable anonymously with no
-- membership check, so anyone could burn invoice numbers and punch gaps in a
-- sequence that is legally required to be gapless.
revoke all on function public.allocate_document_number(public.document_type, date) from public, anon;
revoke all on function public.recompute_document_totals(uuid)                       from public, anon;
revoke all on function public.qa_check_is_complete(uuid)                            from public, anon;
revoke all on function public.create_document(uuid, public.document_type, date, text, text, uuid, text, text) from public, anon;
revoke all on function public.issue_document(uuid)                                  from public, anon;
revoke all on function public.cancel_document(uuid, text)                           from public, anon;
revoke all on function public.update_order_spec(uuid, text, text, text)             from public, anon;

grant execute on function public.allocate_document_number(public.document_type, date) to authenticated;
grant execute on function public.recompute_document_totals(uuid)                       to authenticated;
grant execute on function public.qa_check_is_complete(uuid)                            to authenticated;
grant execute on function public.create_document(uuid, public.document_type, date, text, text, uuid, text, text) to authenticated;
grant execute on function public.issue_document(uuid)                                  to authenticated;
grant execute on function public.cancel_document(uuid, text)                           to authenticated;
grant execute on function public.update_order_spec(uuid, text, text, text)             to authenticated;

-- Identity helpers run inside every RLS policy, so signed-in users must keep
-- EXECUTE or the security model stops working. Anonymous callers do not.
revoke all on function public.is_active_member()           from public, anon;
revoke all on function public.is_admin()                   from public, anon;
revoke all on function public.can_see_ip(public.ip_assets) from public, anon;

grant execute on function public.is_active_member()           to authenticated;
grant execute on function public.is_admin()                   to authenticated;
grant execute on function public.can_see_ip(public.ip_assets) to authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fy_label','amount_in_words','words_below_100','doc_type_is_taxable')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- Verified after applying:
--   functions missing search_path            0
--   trigger functions callable by anon       0
--   trigger functions callable by staff      0
--   anon can allocate invoice numbers        no
--   anon can issue / create / cancel docs    no
--   staff can still issue documents          yes
--   signed-in admin can still read every table
