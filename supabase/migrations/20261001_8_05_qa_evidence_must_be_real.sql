-- QA evidence has to be real evidence.
--
-- The dispatch gate (guard_dispatch_needs_qa → qa_check_is_complete) counts
-- qa_media rows: one photo and one video on a passed check, and the order may
-- leave the building. But nothing checked what a row pointed at. A request
-- made outside the screen could attach a "photo" whose storage_path names a
-- file that was never uploaded — or another order's photo — plus a "video"
-- link of javascript:… or any made-up text, and the gate would open.
--
-- From now on, when evidence is attached:
--   * a photo must be a file that exists in the private qa-evidence bucket,
--     filed under this order and this check (the path the app itself uses:
--     <order_id>/<qa_check_id>/<file>);
--   * a video must be an http(s) link;
--   * and the kind must match: photos are uploads, videos are links.
--
-- Only new evidence is checked. The one existing row already satisfies all of
-- it (verified 1 Oct 2026).

create or replace function public.guard_qa_media()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order uuid;
begin
  select c.order_id into v_order from public.qa_checks c where c.id = new.qa_check_id;
  if v_order is null then
    raise exception 'That QA check no longer exists.';
  end if;

  if new.kind = 'photo' then
    if new.storage_path is null then
      raise exception 'A photo has to be uploaded, not linked.';
    end if;
    if new.storage_path not like v_order::text || '/' || new.qa_check_id::text || '/%'
       or new.storage_path like '%..%' then
      raise exception 'That photo does not belong to this QA check.';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'qa-evidence' and o.name = new.storage_path
    ) then
      raise exception 'That photo has not finished uploading. Try attaching it again.';
    end if;
  else
    if new.external_url is null or new.external_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'A video has to be a full link starting with https://';
    end if;
  end if;

  return new;
end $function$;

revoke all on function public.guard_qa_media() from public, anon, authenticated;

drop trigger if exists qa_media_guard on public.qa_media;
create trigger qa_media_guard
  before insert on public.qa_media
  for each row execute function public.guard_qa_media();

-- Verification (as a signed-in staff member, each must fail with the message
-- shown):
--   insert into qa_media (qa_check_id, kind, storage_path) values (<check>, 'photo', 'nope.jpg');
--     -> That photo does not belong to this QA check.
--   insert into qa_media (qa_check_id, kind, external_url) values (<check>, 'video', 'javascript:alert(1)');
--     -> A video has to be a full link starting with https://
-- and attaching a real photo and a real link from the order screen still works.
--
-- Rollback:
--   drop trigger qa_media_guard on public.qa_media;
--   drop function public.guard_qa_media();
