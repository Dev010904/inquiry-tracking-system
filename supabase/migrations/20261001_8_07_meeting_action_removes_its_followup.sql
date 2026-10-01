-- An action item with an owner and a due date puts a follow-up on the alarm
-- panel (sync_meeting_action_followup). Removing the action from the minutes
-- left that follow-up behind: its owner kept being reminded, on the inquiry and
-- on the dashboard, about an action that no longer existed, and the only way to
-- clear it was to mark it done as if the work had happened. Found in the
-- localhost test on 1 Oct 2026.
--
-- The follow-up now goes with its action, unless it is already done: a done
-- follow-up records work that happened and stays on the inquiry's timeline.
-- The deletion is audited like any other (followups_audit).
--
-- Apply after 8_02. 8_02 is what stops staff writing meeting_actions.followup_id
-- themselves; without it, a hand-made action could point at any follow-up and
-- take it with it when removed.
--
-- No existing data is changed. On 1 Oct 2026 meetings and meeting_actions were
-- both empty, so no follow-up had been left behind yet.

create or replace function public.remove_meeting_action_followup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.followup_id is not null then
    delete from public.followups where id = old.followup_id and not is_done;
  end if;
  return old;
end $function$;

-- A trigger function: nobody calls it directly (8_01 rule).
revoke all on function public.remove_meeting_action_followup() from public, anon, authenticated;

drop trigger if exists meeting_actions_remove_followup on public.meeting_actions;
create trigger meeting_actions_remove_followup
  after delete on public.meeting_actions
  for each row execute function public.remove_meeting_action_followup();

-- Verification:
--   select tgname from pg_trigger
--    where tgrelid = 'public.meeting_actions'::regclass and not tgisinternal
--    order by tgname;
--   -> meeting_actions_remove_followup is listed beside meeting_actions_audit,
--      meeting_actions_followup and meeting_actions_updated.
--
-- Rollback:
--   drop trigger if exists meeting_actions_remove_followup on public.meeting_actions;
--   drop function if exists public.remove_meeting_action_followup();
