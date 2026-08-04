-- Phase 2A · 04 · orders gain technical_specification and addendum.
--
-- Applied 04 Aug 2026. Specification: docs/specs/PHASE-2-REQUIREMENTS.md §3.7.
--
-- Additive. `notes` is kept for general remarks and is not altered — only read,
-- to back-fill the new specification field where anything was written there.

alter table public.orders
  add column if not exists technical_specification text,
  add column if not exists addendum                text;

comment on column public.orders.technical_specification is
  'What was agreed and what production builds to. Required when converting an inquiry.';
comment on column public.orders.addendum is
  'Variations agreed after the original specification.';

update public.orders
   set technical_specification = notes
 where coalesce(trim(notes), '') <> ''
   and technical_specification is null;

-- Writes that must carry a reason.
--
-- The reason and the update happen in one transaction, which is the only way
-- the audit trigger can read it: PostgREST gives every request its own
-- transaction, so a reason set by a separate call would already be gone.
create or replace function public.update_order_spec(
  p_order_id uuid,
  p_technical_specification text,
  p_addendum text,
  p_reason text
) returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when changing the specification';
  end if;
  perform set_config('app.change_note', p_reason, true);
  update public.orders
     set technical_specification = p_technical_specification,
         addendum                = p_addendum
   where id = p_order_id;
end $function$;

revoke execute on function public.update_order_spec(uuid, text, text, text) from anon;
grant   execute on function public.update_order_spec(uuid, text, text, text) to authenticated;

-- security invoker is deliberate: the caller's RLS still applies, so a staff
-- member cannot use this function to edit an order they could not otherwise
-- reach. Only the reason-passing is privileged, and that is harmless.
--
-- Verification run before and after, both matching:
--   notes fingerprint    b99834bc19bbad24580b3adfa04fb947  (unchanged)
--   money fingerprint    00ce04e531c76fac5baa4c8976e0a570  (unchanged)
--   backfill mismatches  0
