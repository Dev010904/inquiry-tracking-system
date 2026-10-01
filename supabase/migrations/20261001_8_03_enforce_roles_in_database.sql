-- Make custom roles real: the database enforces them, not just the menu.
--
-- Until now a role decided which screens appear (src/lib/permissions.ts says
-- so: "this governs feature visibility only"). Every policy underneath asked
-- one question — is this an active staff account? — so a person whose role
-- shows them only the dashboard could still read every payment, invoice, bank
-- detail, R&D budget and meeting through the database API with their own
-- login. Today that is the "Staff" role.
--
-- After this file the policies ask what the PAGES ask:
--
--   * has_feature(key [, edit]) mirrors featureMapFor() exactly: an account
--     with no role (role_id null) keeps everything, which is every admin today,
--     so nobody currently unrestricted loses anything; an account with a role
--     gets what role_features grants it, view or edit.
--   * Each table is readable by the features whose screens read it (the list
--     per table below was taken from src/lib/queries and the pages), plus the
--     person's own work: their follow-ups and tasks, and the inquiry, company,
--     order or project those hang off, which the My work dashboard shows.
--   * Each write needs the feature the server action already checks with
--     editorOrNull(). The SECURITY DEFINER document functions now check the
--     Documents feature themselves, since RLS does not apply inside them.
--   * The audit feed shows a row only if its table belongs to a feature the
--     reader has — unless they hold "Recent changes" (activity), which is the
--     whole log by design. Restricted IP stays hidden exactly as before, and
--     IP rows also need a feature that can see IP assets (IP, Dashboard, R&D).
--
-- Profiles, roles and role_features stay readable by every active account: the
-- app needs names everywhere and each person's own feature map.
--
-- Every policy wraps its helper calls in (select ...), so Postgres evaluates
-- them once per query rather than once per row.
--
-- No data is read or changed by this file. Apply after 8_01 and 8_02.

-- 1. Helpers ---------------------------------------------------------------

create or replace function public.has_feature(p_key text, p_edit boolean default false)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and (
         p.role_id is null
         or exists (
           select 1
             from public.role_features f
            where f.role_id = p.role_id
              and f.feature_key = p_key
              and f.can_view
              and (not p_edit or f.can_edit)
         )
       )
  );
$function$;

create or replace function public.has_any_feature(variadic p_keys text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and (
         p.role_id is null
         or exists (
           select 1
             from public.role_features f
            where f.role_id = p.role_id
              and f.feature_key = any (p_keys)
              and f.can_view
         )
       )
  );
$function$;

create or replace function public.can_edit_any_feature(variadic p_keys text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and (
         p.role_id is null
         or exists (
           select 1
             from public.role_features f
            where f.role_id = p.role_id
              and f.feature_key = any (p_keys)
              and f.can_view
              and f.can_edit
         )
       )
  );
$function$;

-- The caller's own work, and what it hangs off. SECURITY DEFINER so a policy
-- can use them without recursing through another table's policy.
create or replace function public.my_followup_inquiry_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select f.inquiry_id
    from public.followups f
   where f.assigned_to = auth.uid()
     and public.is_active_member();
$function$;

create or replace function public.my_followup_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select i.company_id
    from public.followups f
    join public.inquiries i on i.id = f.inquiry_id
   where f.assigned_to = auth.uid()
     and public.is_active_member();
$function$;

create or replace function public.my_task_parent_ids(p_kind public.parent_kind)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.parent_id
    from public.tasks t
   where t.assigned_to = auth.uid()
     and t.parent_type = p_kind
     and public.is_active_member();
$function$;

-- Which audit rows a reader without "Recent changes" may see, by table.
create or replace function public.visible_activity_tables()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select array_remove(array[
    case when public.has_any_feature('dashboard', 'inquiries')             then 'inquiries'       end,
    case when public.has_any_feature('dashboard', 'inquiries')             then 'followups'       end,
    case when public.has_any_feature('dashboard', 'inquiries', 'companies') then 'companies'       end,
    case when public.has_any_feature('dashboard', 'inquiries', 'companies') then 'contacts'        end,
    case when public.has_feature('orders')                                 then 'orders'          end,
    case when public.has_feature('orders')                                 then 'order_items'     end,
    case when public.has_any_feature('orders', 'payments')                 then 'payments'        end,
    case when public.has_feature('orders')                                 then 'qa_checks'       end,
    case when public.has_feature('orders')                                 then 'qa_media'        end,
    case when public.has_feature('orders')                                 then 'qualifications'  end,
    case when public.has_feature('documents')                              then 'invoices'        end,
    case when public.has_feature('documents')                              then 'invoice_lines'   end,
    case when public.has_any_feature('meetings', 'orders')                 then 'meetings'        end,
    case when public.has_any_feature('meetings', 'orders')                 then 'meeting_actions' end,
    case when public.has_feature('rnd')                                    then 'rnd_projects'    end,
    case when public.has_feature('rnd')                                    then 'rnd_expenses'    end,
    case when public.has_feature('ip')                                     then 'ip_assets'       end,
    case when public.has_feature('ip')                                     then 'ip_events'       end,
    case when public.has_any_feature('orders', 'rnd')                      then 'work_updates'    end,
    case when public.has_any_feature('orders', 'rnd')                      then 'tasks'           end
  ], null);
$function$;

revoke all on function public.has_feature(text, boolean)              from public, anon;
revoke all on function public.has_any_feature(text[])                 from public, anon;
revoke all on function public.can_edit_any_feature(text[])            from public, anon;
revoke all on function public.my_followup_inquiry_ids()               from public, anon;
revoke all on function public.my_followup_company_ids()               from public, anon;
revoke all on function public.my_task_parent_ids(public.parent_kind)  from public, anon;
revoke all on function public.visible_activity_tables()               from public, anon;

grant execute on function public.has_feature(text, boolean)              to authenticated;
grant execute on function public.has_any_feature(text[])                 to authenticated;
grant execute on function public.can_edit_any_feature(text[])            to authenticated;
grant execute on function public.my_followup_inquiry_ids()               to authenticated;
grant execute on function public.my_followup_company_ids()               to authenticated;
grant execute on function public.my_task_parent_ids(public.parent_kind)  to authenticated;
grant execute on function public.visible_activity_tables()               to authenticated;

-- 2. Sales ---------------------------------------------------------------------

drop policy if exists companies_select on public.companies;
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (
    (select public.has_any_feature('dashboard', 'inquiries', 'companies', 'orders', 'payments', 'documents', 'meetings'))
    or id in (select public.my_followup_company_ids())
  );
create policy companies_insert on public.companies for insert to authenticated
  with check ((select public.can_edit_any_feature('companies', 'inquiries')));
create policy companies_update on public.companies for update to authenticated
  using ((select public.has_feature('companies', true)))
  with check ((select public.has_feature('companies', true)));

drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using ((select public.has_any_feature('dashboard', 'inquiries', 'companies', 'orders', 'documents')));
create policy contacts_insert on public.contacts for insert to authenticated
  with check ((select public.can_edit_any_feature('companies', 'inquiries')));
create policy contacts_update on public.contacts for update to authenticated
  using ((select public.has_feature('companies', true)))
  with check ((select public.has_feature('companies', true)));

drop policy if exists inquiries_select on public.inquiries;
drop policy if exists inquiries_insert on public.inquiries;
drop policy if exists inquiries_update on public.inquiries;
create policy inquiries_select on public.inquiries for select to authenticated
  using (
    (select public.has_any_feature('dashboard', 'inquiries', 'companies', 'orders', 'payments', 'documents', 'meetings'))
    or id in (select public.my_followup_inquiry_ids())
  );
create policy inquiries_insert on public.inquiries for insert to authenticated
  with check ((select public.has_feature('inquiries', true)));
create policy inquiries_update on public.inquiries for update to authenticated
  using ((select public.has_feature('inquiries', true)))
  with check ((select public.has_feature('inquiries', true)));

drop policy if exists followups_select on public.followups;
drop policy if exists followups_insert on public.followups;
drop policy if exists followups_update on public.followups;
create policy followups_select on public.followups for select to authenticated
  using (
    (select public.has_any_feature('dashboard', 'inquiries'))
    or assigned_to = (select auth.uid())
  );
create policy followups_insert on public.followups for insert to authenticated
  with check ((select public.has_feature('inquiries', true)));
-- markFollowupDone / snoozeFollowup accept either right (editorOfAny).
create policy followups_update on public.followups for update to authenticated
  using ((select public.can_edit_any_feature('inquiries', 'dashboard')))
  with check ((select public.can_edit_any_feature('inquiries', 'dashboard')));

-- 3. Orders ----------------------------------------------------------------------

drop policy if exists orders_select on public.orders;
drop policy if exists orders_insert on public.orders;
drop policy if exists orders_update on public.orders;
create policy orders_select on public.orders for select to authenticated
  using (
    (select public.has_any_feature('dashboard', 'inquiries', 'companies', 'orders', 'payments', 'documents', 'meetings'))
    or id in (select public.my_task_parent_ids('order'))
  );
-- convertToOrder lives on the inquiry screen and checks Inquiries.
create policy orders_insert on public.orders for insert to authenticated
  with check ((select public.has_feature('inquiries', true)));
create policy orders_update on public.orders for update to authenticated
  using ((select public.has_feature('orders', true)))
  with check ((select public.has_feature('orders', true)));

drop policy if exists order_items_select on public.order_items;
drop policy if exists order_items_insert on public.order_items;
drop policy if exists order_items_update on public.order_items;
create policy order_items_select on public.order_items for select to authenticated
  using ((select public.has_feature('orders')));
create policy order_items_insert on public.order_items for insert to authenticated
  with check ((select public.has_feature('orders', true)));
create policy order_items_update on public.order_items for update to authenticated
  using ((select public.has_feature('orders', true)))
  with check ((select public.has_feature('orders', true)));

drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
create policy payments_select on public.payments for select to authenticated
  using ((select public.has_any_feature('orders', 'payments')));
create policy payments_insert on public.payments for insert to authenticated
  with check ((select public.has_feature('orders', true)));
create policy payments_update on public.payments for update to authenticated
  using ((select public.has_feature('orders', true)))
  with check ((select public.has_feature('orders', true)));

drop policy if exists qa_checks_select on public.qa_checks;
drop policy if exists qa_checks_insert on public.qa_checks;
drop policy if exists qa_checks_update on public.qa_checks;
create policy qa_checks_select on public.qa_checks for select to authenticated
  using ((select public.has_feature('orders')));
create policy qa_checks_insert on public.qa_checks for insert to authenticated
  with check ((select public.has_feature('orders', true)));
create policy qa_checks_update on public.qa_checks for update to authenticated
  using ((select public.has_feature('orders', true)))
  with check ((select public.has_feature('orders', true)));

drop policy if exists qa_media_select on public.qa_media;
drop policy if exists qa_media_write  on public.qa_media;
create policy qa_media_select on public.qa_media for select to authenticated
  using ((select public.has_feature('orders')));
create policy qa_media_insert on public.qa_media for insert to authenticated
  with check ((select public.has_feature('orders', true)));
create policy qa_media_delete on public.qa_media for delete to authenticated
  using ((select public.has_feature('orders', true)));

drop policy if exists qualifications_select on public.qualifications;
drop policy if exists qualifications_write  on public.qualifications;
create policy qualifications_select on public.qualifications for select to authenticated
  using ((select public.has_feature('orders')));
create policy qualifications_insert on public.qualifications for insert to authenticated
  with check ((select public.has_feature('orders', true)));
create policy qualifications_update on public.qualifications for update to authenticated
  using ((select public.has_feature('orders', true)))
  with check ((select public.has_feature('orders', true)));

-- Work updates and tasks follow the thing they hang off.
drop policy if exists work_updates_select on public.work_updates;
drop policy if exists work_updates_insert on public.work_updates;
drop policy if exists work_updates_update on public.work_updates;
create policy work_updates_select on public.work_updates for select to authenticated
  using (
    (parent_type = 'order' and (select public.has_feature('orders')))
    or (parent_type = 'rnd' and (select public.has_feature('rnd')))
  );
create policy work_updates_insert on public.work_updates for insert to authenticated
  with check (
    (parent_type = 'order' and (select public.has_feature('orders', true)))
    or (parent_type = 'rnd' and (select public.has_feature('rnd', true)))
  );

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (
    (parent_type = 'order' and (select public.has_feature('orders')))
    or (parent_type = 'rnd' and (select public.has_feature('rnd')))
    or assigned_to = (select auth.uid())
  );
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    (select public.is_admin())
    and (
      (parent_type = 'order' and (select public.has_feature('orders', true)))
      or (parent_type = 'rnd' and (select public.has_feature('rnd', true)))
    )
  );
-- Ownership itself is decided by guard_task_ownership(), as before.
create policy tasks_update on public.tasks for update to authenticated
  using ((select public.is_admin()) or assigned_to = (select auth.uid()))
  with check ((select public.is_admin()) or assigned_to = (select auth.uid()));

-- 4. Documents ----------------------------------------------------------------------

-- The order and inquiry screens list their documents, so both may read them.
drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_insert on public.invoices;
drop policy if exists invoices_update on public.invoices;
drop policy if exists invoices_delete on public.invoices;
create policy invoices_select on public.invoices for select to authenticated
  using ((select public.has_any_feature('documents', 'orders', 'inquiries')));
create policy invoices_delete on public.invoices for delete to authenticated
  using (
    status = 'draft'
    and (select public.is_admin())
    and (select public.has_feature('documents', true))
  );

drop policy if exists invoice_lines_select on public.invoice_lines;
drop policy if exists invoice_lines_write  on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using ((select public.has_feature('documents')));
create policy invoice_lines_insert on public.invoice_lines for insert to authenticated
  with check (
    (select public.has_feature('documents', true))
    and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.status = 'draft')
  );
create policy invoice_lines_update on public.invoice_lines for update to authenticated
  using (
    (select public.has_feature('documents', true))
    and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.status = 'draft')
  )
  with check (
    (select public.has_feature('documents', true))
    and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.status = 'draft')
  );
create policy invoice_lines_delete on public.invoice_lines for delete to authenticated
  using (
    (select public.has_feature('documents', true))
    and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.status = 'draft')
  );

-- Bank details live here. Read by the screens that print or raise documents
-- (Documents, an order's documents panel, the new-inquiry form's currency
-- default) and by whoever manages Settings.
drop policy if exists company_settings_select on public.company_settings;
drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_select on public.company_settings for select to authenticated
  using (
    (select public.has_any_feature('documents', 'orders', 'inquiries'))
    or (select public.can_manage_settings())
  );
create policy company_settings_update on public.company_settings for update to authenticated
  using ((select public.can_manage_settings()))
  with check ((select public.can_manage_settings()));

drop policy if exists installation_options_select on public.installation_options;
drop policy if exists installation_options_insert on public.installation_options;
drop policy if exists installation_options_update on public.installation_options;
drop policy if exists installation_options_delete on public.installation_options;
create policy installation_options_select on public.installation_options for select to authenticated
  using ((select public.has_feature('documents')));

-- Written only by definer functions since 8_02; the write policies are dead.
drop policy if exists document_series_write on public.document_series;
drop policy if exists hsn_codes_write       on public.hsn_codes;

-- 5. Meetings -------------------------------------------------------------------------

drop policy if exists meetings_select on public.meetings;
drop policy if exists meetings_write  on public.meetings;
create policy meetings_select on public.meetings for select to authenticated
  using ((select public.has_any_feature('meetings', 'orders')));
create policy meetings_insert on public.meetings for insert to authenticated
  with check ((select public.has_feature('meetings', true)));
create policy meetings_update on public.meetings for update to authenticated
  using ((select public.has_feature('meetings', true)))
  with check ((select public.has_feature('meetings', true)));

drop policy if exists meeting_actions_select on public.meeting_actions;
drop policy if exists meeting_actions_write  on public.meeting_actions;
create policy meeting_actions_select on public.meeting_actions for select to authenticated
  using ((select public.has_any_feature('meetings', 'orders')));
create policy meeting_actions_insert on public.meeting_actions for insert to authenticated
  with check ((select public.has_feature('meetings', true)));
create policy meeting_actions_update on public.meeting_actions for update to authenticated
  using ((select public.has_feature('meetings', true)))
  with check ((select public.has_feature('meetings', true)));
create policy meeting_actions_delete on public.meeting_actions for delete to authenticated
  using ((select public.has_feature('meetings', true)));

-- 6. R&D and IP ---------------------------------------------------------------------

drop policy if exists rnd_select on public.rnd_projects;
drop policy if exists rnd_insert on public.rnd_projects;
drop policy if exists rnd_update on public.rnd_projects;
-- The IP screens name the project an asset came from.
create policy rnd_select on public.rnd_projects for select to authenticated
  using (
    (select public.has_any_feature('rnd', 'ip'))
    or id in (select public.my_task_parent_ids('rnd'))
  );
create policy rnd_insert on public.rnd_projects for insert to authenticated
  with check ((select public.has_feature('rnd', true)));
create policy rnd_update on public.rnd_projects for update to authenticated
  using ((select public.has_feature('rnd', true)))
  with check ((select public.has_feature('rnd', true)));

drop policy if exists rnd_expenses_select on public.rnd_expenses;
drop policy if exists rnd_expenses_insert on public.rnd_expenses;
drop policy if exists rnd_expenses_update on public.rnd_expenses;
create policy rnd_expenses_select on public.rnd_expenses for select to authenticated
  using ((select public.has_feature('rnd')));
create policy rnd_expenses_insert on public.rnd_expenses for insert to authenticated
  with check ((select public.has_feature('rnd', true)));
create policy rnd_expenses_update on public.rnd_expenses for update to authenticated
  using ((select public.has_feature('rnd', true)))
  with check ((select public.has_feature('rnd', true)));

-- Restricted assets stay behind can_see_ip(), as before; the feature is on top.
-- The dashboard's renewal alarms and the R&D project page read assets too.
drop policy if exists ip_assets_select on public.ip_assets;
drop policy if exists ip_assets_insert on public.ip_assets;
drop policy if exists ip_assets_update on public.ip_assets;
create policy ip_assets_select on public.ip_assets for select to authenticated
  using (
    (select public.has_any_feature('ip', 'dashboard', 'rnd'))
    and public.can_see_ip(ip_assets.*)
  );
create policy ip_assets_insert on public.ip_assets for insert to authenticated
  with check ((select public.has_feature('ip', true)));
create policy ip_assets_update on public.ip_assets for update to authenticated
  using ((select public.has_feature('ip', true)) and public.can_see_ip(ip_assets.*))
  with check ((select public.has_feature('ip', true)));

drop policy if exists ip_events_select on public.ip_events;
drop policy if exists ip_events_insert on public.ip_events;
drop policy if exists ip_events_update on public.ip_events;
create policy ip_events_select on public.ip_events for select to authenticated
  using (
    (select public.has_any_feature('ip', 'dashboard'))
    and exists (
      select 1 from public.ip_assets a
       where a.id = ip_events.ip_asset_id and public.can_see_ip(a.*)
    )
  );
create policy ip_events_insert on public.ip_events for insert to authenticated
  with check (
    (select public.has_feature('ip', true))
    and exists (
      select 1 from public.ip_assets a
       where a.id = ip_events.ip_asset_id and public.can_see_ip(a.*)
    )
  );

-- 7. People ----------------------------------------------------------------------------

-- Same rule as before, rewritten so auth.uid() is evaluated once per query
-- (the performance advisor's auth_rls_initplan warning).
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_admin()) or id = (select auth.uid()))
  with check ((select public.is_admin()) or id = (select auth.uid()));

-- 8. Audit trail -----------------------------------------------------------------------

drop policy if exists activity_log_staff_select on public.activity_log;
create policy activity_log_staff_select on public.activity_log for select to authenticated
  using (
    (select public.is_active_member())
    and (
      (select public.has_feature('activity'))
      or table_name in (select unnest(public.visible_activity_tables()))
    )
    and (
      table_name <> all (array['ip_assets', 'ip_events'])
      or (table_name = 'ip_assets' and exists (
            select 1 from public.ip_assets a
             where a.id = activity_log.row_id and public.can_see_ip(a.*)))
      or (table_name = 'ip_events' and exists (
            select 1 from public.ip_events e
              join public.ip_assets a on a.id = e.ip_asset_id
             where e.id = activity_log.row_id and public.can_see_ip(a.*)))
    )
  );

-- 9. QA photos in Storage -----------------------------------------------------------

drop policy if exists "qa evidence readable by staff" on storage.objects;
drop policy if exists "qa evidence writable by staff" on storage.objects;
create policy "qa evidence readable by staff" on storage.objects for select to authenticated
  using (bucket_id = 'qa-evidence' and (select public.has_feature('orders')));
create policy "qa evidence writable by staff" on storage.objects for insert to authenticated
  with check (bucket_id = 'qa-evidence' and (select public.has_feature('orders', true)));
-- "qa evidence removable by admin" is unchanged.

-- 10. The definer functions check the feature themselves ------------------------------
--
-- Bodies are the live definitions read out of the database on 1 Oct 2026, with
-- only the opening permission check changed. RLS does not apply inside a
-- SECURITY DEFINER function, so without this a dashboard-only account could
-- call create_quotation()/issue_document() through the API and burn numbers.

create or replace function public.accept_quotation(p_quotation_id uuid, p_technical_specification text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  q public.invoices;
  new_order_id uuid;
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;

  select * into q from public.invoices where id = p_quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  if q.doc_type <> 'quotation' then raise exception 'That document is not a quotation.'; end if;
  if q.status <> 'issued' then
    raise exception 'Only an issued quotation can be accepted.';
  end if;
  if q.inquiry_id is null then raise exception 'This quotation has no inquiry behind it.'; end if;

  if exists (select 1 from public.orders where inquiry_id = q.inquiry_id and deleted_at is null) then
    raise exception 'That inquiry already has an order.';
  end if;

  insert into public.orders (inquiry_id, order_value, technical_specification, created_by)
  values (q.inquiry_id, 0, p_technical_specification, auth.uid())
  returning id into new_order_id;

  insert into public.order_items (
    order_id, line_no, description, hsn_sac, quantity, unit, rate,
    gst_rate, zero_rate_reason, created_by
  )
  select new_order_id, l.line_no, l.description, l.hsn_sac, l.quantity, l.unit, l.rate,
         l.gst_rate, l.zero_rate_reason, auth.uid()
    from public.invoice_lines l
   where l.invoice_id = p_quotation_id
   order by l.line_no;

  update public.inquiries set status = 'confirmed' where id = q.inquiry_id;

  return new_order_id;
end $function$;

create or replace function public.add_installation_option(p_label text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  clean text := btrim(coalesce(p_label, ''));
  out_label text;
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;
  if clean = '' then raise exception 'Type the installation scope before adding it.'; end if;
  if length(clean) > 200 then raise exception 'That is too long for a dropdown entry.'; end if;

  insert into public.installation_options (label, created_by)
  values (clean, auth.uid())
  on conflict (label) do nothing;

  select label into out_label from public.installation_options where label = clean;
  return out_label;
end $function$;

create or replace function public.cancel_document(p_invoice_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (public.is_admin() and public.has_feature('documents', true)) then raise exception 'Only an admin can cancel a document.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required to cancel a document.'; end if;

  update public.invoices
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = p_reason,
         cancelled_by = auth.uid()
   where id = p_invoice_id and status in ('draft','issued');

  if not found then raise exception 'That document cannot be cancelled.'; end if;
end $function$;

create or replace function public.create_document(p_order_id uuid, p_doc_type document_type, p_doc_date date default current_date, p_place_of_supply_code text default null::text, p_place_of_supply_name text default null::text, p_parent_invoice_id uuid default null::uuid, p_notes text default null::text, p_reason text default null::text, p_valid_days integer default 15)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  ord public.orders;
  comp public.companies;
  inq public.inquiries;
  cs public.company_settings;
  new_id uuid;
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;

  select * into ord from public.orders where id = p_order_id and deleted_at is null;
  if not found then raise exception 'That order no longer exists.'; end if;

  select * into inq from public.inquiries where id = ord.inquiry_id;
  select * into comp from public.companies where id = inq.company_id;
  select * into cs from public.company_settings where singleton;

  if public.doc_type_is_taxable(p_doc_type) and not comp.gst_applicable then
    raise exception 'This client is marked as not GST-applicable. Issue a bill of supply instead.';
  end if;
  if p_doc_type = 'bill_of_supply' and comp.gst_applicable then
    raise exception 'A bill of supply is only for clients marked as not GST-applicable.';
  end if;
  if p_doc_type in ('credit_note','debit_note') and p_parent_invoice_id is null then
    raise exception 'A credit or debit note must reference the invoice it corrects.';
  end if;
  if p_doc_type = 'quotation' then
    raise exception 'A quotation is raised against an inquiry. Use create_quotation().';
  end if;

  insert into public.invoices (
    doc_type, order_id, company_id, parent_invoice_id, doc_date,
    place_of_supply_code, place_of_supply_name, notes, reason, created_by,
    valid_days, payment_terms, delivery_timeline,
    installation_scope, visit_rate, visit_count
  ) values (
    p_doc_type, p_order_id, comp.id, p_parent_invoice_id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, p_reason, auth.uid(),
    coalesce(p_valid_days, 15),
    cs.payment_terms, cs.delivery_timeline,
    cs.default_installation_scope, cs.default_visit_rate, cs.default_visit_count
  ) returning id into new_id;

  insert into public.invoice_lines (
    invoice_id, line_no, description, hsn_sac, quantity, unit, rate,
    taxable_value, gst_rate, zero_rate_reason, line_total
  )
  select new_id, i.line_no, i.description, i.hsn_sac, i.quantity, i.unit, i.rate,
         i.amount,
         case when public.doc_type_shows_tax(p_doc_type) then i.gst_rate else 0 end,
         case when public.doc_type_shows_tax(p_doc_type) then i.zero_rate_reason else null end,
         i.amount
    from public.order_items i
   where i.order_id = p_order_id and i.deleted_at is null
   order by i.line_no;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

create or replace function public.create_quotation(p_inquiry_id uuid, p_doc_date date default current_date, p_place_of_supply_code text default null::text, p_place_of_supply_name text default null::text, p_notes text default null::text, p_valid_days integer default 15)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  inq public.inquiries;
  comp public.companies;
  cs public.company_settings;
  new_id uuid;
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;

  select * into inq from public.inquiries where id = p_inquiry_id and deleted_at is null;
  if not found then raise exception 'That inquiry no longer exists.'; end if;

  select * into comp from public.companies where id = inq.company_id;
  select * into cs from public.company_settings where singleton;

  insert into public.invoices (
    doc_type, inquiry_id, company_id, doc_date,
    place_of_supply_code, place_of_supply_name, notes, created_by,
    valid_days, payment_terms, delivery_timeline,
    installation_scope, visit_rate, visit_count
  ) values (
    'quotation', p_inquiry_id, comp.id, p_doc_date,
    coalesce(p_place_of_supply_code, left(comp.gstin, 2)), coalesce(p_place_of_supply_name, comp.state),
    p_notes, auth.uid(),
    coalesce(p_valid_days, 15), cs.payment_terms, cs.delivery_timeline,
    cs.default_installation_scope, cs.default_visit_rate, cs.default_visit_count
  ) returning id into new_id;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

create or replace function public.duplicate_document(p_invoice_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  src public.invoices;
  new_id uuid;
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;

  select * into src from public.invoices where id = p_invoice_id;
  if not found then raise exception 'That document no longer exists.'; end if;

  insert into public.invoices (
    doc_type, status, order_id, inquiry_id, company_id, parent_invoice_id,
    doc_date, place_of_supply_code, place_of_supply_name, reverse_charge,
    notes, created_by,
    valid_days, payment_terms, delivery_timeline,
    installation_scope, visit_rate, visit_count
  ) values (
    src.doc_type, 'draft', src.order_id, src.inquiry_id, src.company_id,
    src.parent_invoice_id, current_date, src.place_of_supply_code,
    src.place_of_supply_name, src.reverse_charge, src.notes, auth.uid(),
    src.valid_days, src.payment_terms, src.delivery_timeline,
    src.installation_scope, src.visit_rate, src.visit_count
  ) returning id into new_id;

  insert into public.invoice_lines (
    invoice_id, line_no, description, hsn_sac, quantity, unit, rate,
    taxable_value, gst_rate, zero_rate_reason, line_total
  )
  select new_id, l.line_no, l.description, l.hsn_sac, l.quantity, l.unit, l.rate,
         l.taxable_value, l.gst_rate, l.zero_rate_reason, l.line_total
    from public.invoice_lines l
   where l.invoice_id = p_invoice_id
   order by l.line_no;

  perform public.recompute_document_totals(new_id);
  return new_id;
end $function$;

create or replace function public.issue_document(p_invoice_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  inv public.invoices;
  cs  public.company_settings;
  comp public.companies;
  con public.contacts;
  alloc record;
  missing text[] := '{}';
  n int;
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;

  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Document not found'; end if;
  if inv.status <> 'draft' then raise exception 'Only a draft can be issued.'; end if;

  select * into cs from public.company_settings where singleton;
  select * into comp from public.companies where id = inv.company_id;

  select * into con from public.contacts
   where company_id = inv.company_id and deleted_at is null
   order by is_primary desc, created_at
   limit 1;

  if coalesce(btrim(cs.legal_name), '') = '' then missing := missing || 'legal name'; end if;
  if coalesce(btrim(cs.address_line1), '') = '' then missing := missing || 'address'; end if;
  if coalesce(btrim(cs.state_code), '') = '' then missing := missing || 'state code'; end if;
  if public.doc_type_is_taxable(inv.doc_type) and coalesce(btrim(cs.gstin), '') = '' then
    missing := missing || 'GSTIN';
  end if;
  if array_length(missing, 1) is not null then
    raise exception 'Company & tax details are incomplete: % must be filled in under Settings before a document can be issued.',
      array_to_string(missing, ', ');
  end if;

  select count(*) into n from public.invoice_lines where invoice_id = p_invoice_id;
  if n = 0 then raise exception 'This document has no lines.'; end if;

  if public.doc_type_is_taxable(inv.doc_type) then
    select count(*) into n from public.invoice_lines
     where invoice_id = p_invoice_id and coalesce(btrim(hsn_sac), '') = '';
    if n > 0 then
      raise exception 'Every line needs an HSN/SAC code before a tax document can be issued. % line(s) are missing one.', n;
    end if;
    if coalesce(btrim(inv.place_of_supply_code), '') = '' then
      raise exception 'Place of supply is required on a tax document.';
    end if;
  end if;

  perform public.recompute_document_totals(p_invoice_id);

  if inv.doc_type = 'quotation' then
    select * into alloc from public.allocate_quotation_number(inv.doc_date);
  else
    select * into alloc from public.allocate_document_number(inv.doc_type, inv.doc_date);
  end if;

  update public.invoices set
    status = 'issued',
    fy = alloc.out_fy,
    seq_number = alloc.out_seq,
    doc_no = alloc.out_doc_no,
    issued_at = now(),
    issued_by = auth.uid(),
    terms = coalesce(inv.terms,
                     case when inv.doc_type = 'quotation' then cs.quotation_terms
                          else cs.invoice_terms end),
    supplier_snapshot = to_jsonb(cs) - 'created_at' - 'updated_at' - 'singleton',
    buyer_snapshot = jsonb_build_object(
      'name', comp.name, 'address', comp.address, 'city', comp.city,
      'state', comp.state, 'gstin', comp.gstin,
      'gst_applicable', comp.gst_applicable,
      'contact_name', con.name, 'contact_phone', con.phone
    )
  where id = p_invoice_id;

  return alloc.out_doc_no;
end $function$;

create or replace function public.refresh_document_totals(p_invoice_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_status public.document_status;
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;

  select status into v_status from public.invoices where id = p_invoice_id;
  if v_status is null then raise exception 'Document not found'; end if;
  if v_status <> 'draft' then
    raise exception 'An issued document cannot be recalculated.';
  end if;

  perform public.recompute_document_totals(p_invoice_id);
end $function$;

create or replace function public.set_document_terms(p_invoice_id uuid, p_valid_days integer, p_payment_terms text default null::text, p_delivery_timeline text default null::text, p_installation_scope text default null::text, p_visit_rate numeric default null::numeric, p_visit_count integer default null::integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.has_feature('documents', true) then raise exception 'Not permitted'; end if;

  if p_valid_days is null or p_valid_days < 0 or p_valid_days > 365 then
    raise exception 'Validity must be between 0 and 365 days.';
  end if;
  if p_visit_rate is not null and p_visit_rate < 0 then
    raise exception 'A visit rate cannot be negative.';
  end if;
  if p_visit_count is not null and (p_visit_count < 0 or p_visit_count > 999) then
    raise exception 'The number of visits must be between 0 and 999.';
  end if;

  update public.invoices
     set valid_days         = p_valid_days,
         payment_terms      = nullif(btrim(coalesce(p_payment_terms, '')), ''),
         delivery_timeline  = nullif(btrim(coalesce(p_delivery_timeline, '')), ''),
         installation_scope = nullif(btrim(coalesce(p_installation_scope, '')), ''),
         visit_rate         = p_visit_rate,
         visit_count        = p_visit_count
   where id = p_invoice_id and status = 'draft';

  if not found then
    raise exception 'Terms can only be changed while the document is a draft.';
  end if;
end $function$;

create or replace function public.update_order_spec(
  p_order_id uuid,
  p_technical_specification text,
  p_addendum text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_feature('orders', true) then
    raise exception 'Not permitted';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when changing the specification';
  end if;

  perform set_config('app.change_note', p_reason, true);

  update public.orders
     set technical_specification = p_technical_specification,
         addendum                = p_addendum
   where id = p_order_id;

  if not found then
    raise exception 'That order no longer exists.';
  end if;
end $function$;

-- `create or replace` keeps existing grants, and 8_01 set them. Restated so this
-- file is correct on its own.
revoke all on function public.accept_quotation(uuid, text)                                                   from public, anon;
revoke all on function public.add_installation_option(text)                                                  from public, anon;
revoke all on function public.cancel_document(uuid, text)                                                    from public, anon;
revoke all on function public.create_document(uuid, public.document_type, date, text, text, uuid, text, text, integer) from public, anon;
revoke all on function public.create_quotation(uuid, date, text, text, text, integer)                        from public, anon;
revoke all on function public.duplicate_document(uuid)                                                       from public, anon;
revoke all on function public.issue_document(uuid)                                                           from public, anon;
revoke all on function public.refresh_document_totals(uuid)                                                  from public, anon;
revoke all on function public.set_document_terms(uuid, integer, text, text, text, numeric, integer)          from public, anon;
revoke all on function public.update_order_spec(uuid, text, text, text)                                      from public, anon;

-- Verification ---------------------------------------------------------------
--
-- Signed in as an account with no role (every admin today) every screen must
-- behave exactly as before. Signed in as an account holding the "Staff" role
-- (dashboard only), the dashboard must still show its alarms, KPIs, recent
-- inquiries and recent changes, while these return no rows:
--   select count(*) from payments;        -- 0
--   select count(*) from invoices;        -- 0
--   select count(*) from company_settings;-- 0
--   select count(*) from order_items;     -- 0
--   select count(*) from rnd_projects;    -- 0 (unless a task of theirs hangs off one)
--   select count(*) from meetings;        -- 0
-- The run recorded in docs/SECURITY-REVIEW-2026-10.md does this for an
-- unrestricted admin, the Staff role, and two made-up roles inside a
-- rolled-back transaction.
--
-- Rollback: re-create the previous policies (each was "is_active_member()" for
-- reads and writes, "is_admin()" for deletes — see the policy list captured in
-- docs/SECURITY-REVIEW-2026-10.md) and the previous function bodies (the
-- opening check was "if not public.is_active_member()").
