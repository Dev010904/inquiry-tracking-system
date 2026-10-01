-- Close every door the anonymous key could open.
--
-- Today nothing leaks: every business table has RLS on, and every policy needs
-- an active staff profile. But the anonymous role still holds SELECT, INSERT,
-- UPDATE, DELETE and even TRUNCATE on almost every table, inherited from
-- Supabase's default grants. That made row level security the ONLY thing
-- standing between the public internet and the data — one policy written as
-- `using (true)` by mistake, on any table, and the anon key (which ships in the
-- browser bundle) would read it. TRUNCATE is not filtered by RLS at all.
--
-- The same defaults hand EXECUTE on every new function to `anon` and to
-- PUBLIC. The 13 Aug hardening revoked those, but every function created or
-- re-created since then got them back: the security advisor lists 14
-- SECURITY DEFINER functions callable without signing in, among them
-- recalc_order_tax(), which writes to orders and checks nobody.
--
-- After this file:
--   * anon holds no privilege on any table, view, sequence or function in
--     `public`. Signing in is the only way to reach the data, whatever any
--     policy says.
--   * signed-in users keep the table privileges RLS already governs, minus
--     TRUNCATE / REFERENCES / TRIGGER, which the app never uses.
--   * functions are callable only by the roles that need them: the RPCs the app
--     calls and the helpers its policies call, granted to `authenticated` only.
--   * objects created later inherit none of the anonymous grants.
--
-- Nothing the app does runs as `anon`: sign-in goes to Supabase Auth, not to
-- the database API, and every query after that runs as `authenticated`.
-- No data is read or changed by this file.

-- 1. Tables, views and sequences --------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- RLS cannot filter TRUNCATE, and nothing here needs REFERENCES or TRIGGER.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- 2. Defaults for objects created from now on ------------------------------
--
-- Objects in `public` are created by `postgres`, whose default privileges in
-- this project grant everything to anon. A table added next year would
-- otherwise arrive readable by the anon key until somebody remembered.

alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- PUBLIC's EXECUTE is a global default, not a per-schema one, so it has to be
-- removed globally. `authenticated` still receives EXECUTE on new functions in
-- `public` through the per-schema default above it.
alter default privileges for role postgres revoke execute on functions from public;

-- 3. Functions ----------------------------------------------------------------
--
-- Start from nothing, then grant back exactly what is used. Trigger functions
-- need no grant at all: Postgres checks EXECUTE when a trigger is created, not
-- when it fires. Internal helpers (number allocation, totals, the QA gate,
-- recalc_order_tax) are reached only from SECURITY DEFINER functions, which run
-- as their owner and need no grant either.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Helpers called inside RLS policies. Policies run as the querying user, so
-- these must stay executable by `authenticated` or every query fails.
grant execute on function public.is_active_member()             to authenticated;
grant execute on function public.is_admin()                     to authenticated;
grant execute on function public.can_manage_settings()          to authenticated;
grant execute on function public.can_see_ip(public.ip_assets)   to authenticated;

-- The RPCs the app calls (`supabase.rpc(...)` in src/app/**/actions.ts and
-- src/lib/queries/documents.ts). Each one checks the caller itself.
grant execute on function public.accept_quotation(uuid, text)                                                   to authenticated;
grant execute on function public.add_installation_option(text)                                                  to authenticated;
grant execute on function public.cancel_document(uuid, text)                                                    to authenticated;
grant execute on function public.create_document(uuid, public.document_type, date, text, text, uuid, text, text, integer) to authenticated;
grant execute on function public.create_quotation(uuid, date, text, text, text, integer)                        to authenticated;
grant execute on function public.document_number_register()                                                     to authenticated;
grant execute on function public.duplicate_document(uuid)                                                       to authenticated;
grant execute on function public.issue_document(uuid)                                                           to authenticated;
grant execute on function public.refresh_document_totals(uuid)                                                  to authenticated;
grant execute on function public.set_document_terms(uuid, integer, text, text, text, numeric, integer)          to authenticated;
grant execute on function public.update_order_spec(uuid, text, text, text)                                      to authenticated;

-- Pure, read-only formatting helpers. Harmless, and kept callable so a future
-- view or default that uses them does not fail for staff.
grant execute on function public.amount_in_words(numeric)                to authenticated;
grant execute on function public.document_amount_words(numeric)          to authenticated;
grant execute on function public.words_below_100(integer)                to authenticated;
grant execute on function public.doc_type_is_taxable(public.document_type) to authenticated;
grant execute on function public.doc_type_shows_tax(public.document_type)  to authenticated;
grant execute on function public.fy_label(date)                          to authenticated;

-- 4. Verification ------------------------------------------------------------
--
-- Pass condition for each query: zero rows.
--
-- Anything in public the anon role can still touch:
--   select c.relname, g.privilege_type
--     from information_schema.role_table_grants g
--     join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
--    where g.table_schema = 'public' and g.grantee = 'anon';
--
-- Any function in public anon (or PUBLIC) can execute:
--   select p.oid::regprocedure
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and (has_function_privilege('anon', p.oid, 'EXECUTE'));
--
-- And from outside, with the anon key, every table must answer 401/42501:
--   curl "$SUPABASE_URL/rest/v1/companies?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   -> {"code":"42501", ...permission denied for table companies}
--
-- Rollback (restores the previous, wider grants — only if something breaks):
--   grant all on all tables in schema public to anon;
--   grant all on all sequences in schema public to anon;
--   grant truncate, references, trigger on all tables in schema public to authenticated;
--   alter default privileges for role postgres in schema public grant all on tables to anon;
--   alter default privileges for role postgres in schema public grant all on sequences to anon;
--   alter default privileges for role postgres in schema public grant all on functions to anon;
--   alter default privileges for role postgres grant execute on functions to public;
--   (function grants: grant execute on function <sig> to anon, authenticated; as needed)
