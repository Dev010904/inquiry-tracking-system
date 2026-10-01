-- Only the system may write the columns the system owns.
--
-- RLS decides WHICH rows a signed-in user may change. It says nothing about
-- WHICH COLUMNS, and the table grants allowed every column. So anyone holding a
-- staff login could send their own request to the database API — the browser
-- already holds everything needed — and write columns no screen ever offers:
--
--   * invoices: set a draft's status to 'issued' with any doc_no they like, or
--     insert an "issued" tax invoice outright. That skips issue_document(), the
--     gapless numbering, the supplier/buyer snapshots and the freeze — a forged
--     statutory document carrying a real number.
--   * inquiries.inquiry_no / orders.order_no: renumber records, or take a future
--     number so the real one later collides.
--   * orders.advance_received / gst_amount / total_with_gst / order_value,
--     rnd_projects.spent_to_date, ip_assets.cost_to_date: the totals the
--     triggers maintain, overwritten by hand.
--   * orders.qa_overridden_by / qa_overridden_at, qa_checks.approved_by: an
--     approval or override attributed to somebody else.
--   * orders.technical_specification: changed with no reason recorded,
--     bypassing update_order_spec().
--   * profiles.email / can_manage_settings: the second is already guarded by a
--     trigger; neither is ever written by the app.
--
-- The fix is column-level privileges: each table grants INSERT and UPDATE on
-- exactly the columns the app writes (listed per server action below), and
-- nothing else. Triggers and SECURITY DEFINER functions run as the table owner
-- and are unaffected, so numbering, totals, snapshots and the audit trail keep
-- working exactly as before. Hard DELETE stays only where the app performs one.
--
-- If a screen ever starts failing with "permission denied for table X", a
-- column was added to a server action without being added here. Add it to the
-- matching grant in a new migration — do not hand the whole table back.
--
-- No data is read or changed by this file.

-- Documents: every write goes through SECURITY DEFINER functions -------------
-- create_document, create_quotation, set_document_terms, refresh_document_totals,
-- issue_document, cancel_document, duplicate_document, accept_quotation.
-- The only direct write is deleteDraft (admin, draft only, enforced by RLS).
revoke insert, update on public.invoices from authenticated;

-- saveDocumentLine / removeDocumentLine. Tax columns are recomputed by
-- refresh_document_totals(); invoice_id cannot be moved after the fact.
revoke insert, update on public.invoice_lines from authenticated;
grant insert (invoice_id, line_no, description, hsn_sac, quantity, unit, rate,
              taxable_value, line_total, gst_rate, zero_rate_reason)
  on public.invoice_lines to authenticated;
grant update (description, hsn_sac, quantity, unit, rate,
              taxable_value, line_total, gst_rate, zero_rate_reason)
  on public.invoice_lines to authenticated;

-- Counters, series and lookup tables: written only by definer functions,
-- never read by the app directly.
revoke all on public.record_counters   from authenticated;
revoke all on public.document_counters from authenticated;
revoke all on public.document_series   from authenticated;
revoke all on public.hsn_codes         from authenticated;
-- add_installation_option() inserts; the app only reads the list.
revoke insert, update, delete on public.installation_options from authenticated;

-- Sales -------------------------------------------------------------------------

-- createCompany, createInquiry (inline company), updateCompany.
revoke insert, update, delete on public.companies from authenticated;
grant insert (name, type, address, city, state, gstin, gst_applicable,
              gst_exemption_reason, notes, created_by)
  on public.companies to authenticated;
grant update (name, type, address, city, state, gstin, gst_applicable,
              gst_exemption_reason, notes)
  on public.companies to authenticated;

-- createInquiry / updateInquiry (inline contact), saveContact (incl. demoting
-- the previous primary).
revoke insert, update, delete on public.contacts from authenticated;
grant insert (company_id, name, phone, email, designation, is_primary, created_by)
  on public.contacts to authenticated;
grant update (company_id, name, phone, email, designation, is_primary)
  on public.contacts to authenticated;

-- createInquiry, updateInquiry, setInquiryStatus, convertToOrder (status).
-- inquiry_no is allocated by gen_inquiry_no() and is never written by hand.
revoke insert, update, delete on public.inquiries from authenticated;
grant insert (inquiry_date, company_id, contact_id, source, requirement_summary,
              estimated_value, currency, status, priority, owner_id, lost_reason,
              created_by)
  on public.inquiries to authenticated;
grant update (inquiry_date, company_id, contact_id, source, requirement_summary,
              estimated_value, currency, status, priority, owner_id, lost_reason)
  on public.inquiries to authenticated;

-- createInquiry / addFollowup insert; markFollowupDone / snoozeFollowup update.
-- done_at is stamped by sync_followup_done().
revoke insert, update, delete on public.followups from authenticated;
grant insert (inquiry_id, due_at, channel, note, assigned_to, created_by)
  on public.followups to authenticated;
grant update (is_done, outcome, snoozed_to)
  on public.followups to authenticated;

-- Orders ------------------------------------------------------------------------

-- convertToOrder inserts (order_value is the opening value of a line-less
-- order); updateOrderDetails and setRequiresQualification update. order_no,
-- gst_amount, total_with_gst, advance_received, completion_pct and the QA
-- override columns belong to triggers. The specification changes only through
-- update_order_spec(), which records the reason (made SECURITY DEFINER below).
revoke insert, update, delete on public.orders from authenticated;
grant insert (inquiry_id, order_date, order_value, currency, delivery_date,
              po_number, technical_specification, addendum, created_by)
  on public.orders to authenticated;
grant update (order_status, delivery_date, po_number, notes, requires_qualification)
  on public.orders to authenticated;

-- saveOrderItem, removeOrderItem (soft delete, admin only via guard_soft_delete).
-- amount is generated; order_id cannot be moved after the fact.
revoke insert, update, delete on public.order_items from authenticated;
grant insert (order_id, line_no, description, hsn_sac, quantity, unit, rate,
              notes, gst_rate, zero_rate_reason, created_by)
  on public.order_items to authenticated;
grant update (description, hsn_sac, quantity, unit, rate, notes, gst_rate,
              zero_rate_reason, deleted_at)
  on public.order_items to authenticated;

-- addPayment, removePayment (soft delete, admin only via guard_soft_delete).
-- A recorded payment's amount is never edited; it is removed and re-entered.
revoke insert, update, delete on public.payments from authenticated;
grant insert (order_id, amount, paid_on, mode, reference, note, created_by)
  on public.payments to authenticated;
grant update (deleted_at)
  on public.payments to authenticated;

-- saveQaCheck. approved_by / approved_at and deleted_at are not app columns.
revoke insert, update, delete on public.qa_checks from authenticated;
grant insert (order_id, report_no, checked_on, result, description, observations,
              conditions, checked_by, created_by)
  on public.qa_checks to authenticated;
grant update (report_no, checked_on, result, description, observations, conditions)
  on public.qa_checks to authenticated;

-- addQaMedia / removeQaMedia. Evidence is attached or removed, never edited.
revoke insert, update on public.qa_media from authenticated;
grant insert (qa_check_id, kind, storage_path, external_url, caption, uploaded_by)
  on public.qa_media to authenticated;

-- saveQualification is an upsert on (order_id, stage). PostgREST writes every
-- column of the payload in both halves of INSERT ... ON CONFLICT DO UPDATE, so
-- both grants carry the full payload.
revoke insert, update, delete on public.qualifications from authenticated;
grant insert (order_id, stage, status, planned_date, performed_on, performed_by,
              customer_representative, customer_signed_off, signed_off_on,
              summary, notes, created_by)
  on public.qualifications to authenticated;
grant update (order_id, stage, status, planned_date, performed_on, performed_by,
              customer_representative, customer_signed_off, signed_off_on,
              summary, notes, created_by)
  on public.qualifications to authenticated;

-- addWorkUpdate. The parent's progress follows by trigger.
revoke insert, update, delete on public.work_updates from authenticated;
grant insert (parent_type, parent_id, update_date, note, progress_pct, author_id)
  on public.work_updates to authenticated;

-- createTask (admin), setTaskStatus, setTaskDetail, reassignTask (admin),
-- deleteTask (admin). completed_at is stamped by sync_task_bookkeeping().
revoke insert, update on public.tasks from authenticated;
grant insert (parent_type, parent_id, title, detail, due_date, assigned_to,
              assigned_by, created_by)
  on public.tasks to authenticated;
grant update (status, detail, assigned_to, assigned_by)
  on public.tasks to authenticated;

-- Meetings ----------------------------------------------------------------------

-- saveMeeting.
revoke insert, update, delete on public.meetings from authenticated;
grant insert (meeting_date, meeting_type, subject, location, company_id, inquiry_id,
              order_id, internal_attendees, client_attendees, agenda, discussion,
              decisions, next_steps, created_by)
  on public.meetings to authenticated;
grant update (meeting_date, meeting_type, subject, location, company_id, inquiry_id,
              order_id, internal_attendees, client_attendees, agenda, discussion,
              decisions, next_steps)
  on public.meetings to authenticated;

-- saveMeetingAction / deleteMeetingAction. followup_id is set by
-- sync_meeting_action_followup().
revoke insert, update on public.meeting_actions from authenticated;
grant insert (meeting_id, action, owner_id, due_on, is_done, done_at)
  on public.meeting_actions to authenticated;
grant update (action, owner_id, due_on, is_done, done_at)
  on public.meeting_actions to authenticated;

-- R&D and IP ----------------------------------------------------------------------

-- createRndProject / updateRndProject. spent_to_date and progress_pct are
-- maintained by triggers.
revoke insert, update, delete on public.rnd_projects from authenticated;
grant insert (project_code, project_name, description, approx_budget, currency,
              start_date, target_date, actual_end_date, stage, lead_id, notes,
              created_by)
  on public.rnd_projects to authenticated;
grant update (project_code, project_name, description, approx_budget, currency,
              start_date, target_date, actual_end_date, stage, lead_id, notes)
  on public.rnd_projects to authenticated;

-- addRndExpense, removeRndExpense (soft delete, admin only via guard_soft_delete).
revoke insert, update, delete on public.rnd_expenses from authenticated;
grant insert (project_id, amount, currency, spent_on, kind, description, vendor,
              reference, created_by)
  on public.rnd_expenses to authenticated;
grant update (deleted_at)
  on public.rnd_expenses to authenticated;

-- createIpAsset / updateIpAsset. cost_to_date is summed from ip_events.
revoke insert, update, delete on public.ip_assets from authenticated;
grant insert (title, ip_type, status, protection_route, jurisdiction, application_no,
              registration_no, rnd_project_id, filing_date, publication_date,
              grant_date, expiry_date, next_renewal_date, inventors, owner_entity,
              attorney_firm, attorney_contact, confidentiality, notes, created_by)
  on public.ip_assets to authenticated;
grant update (title, ip_type, status, protection_route, jurisdiction, application_no,
              registration_no, rnd_project_id, filing_date, publication_date,
              grant_date, expiry_date, next_renewal_date, inventors, owner_entity,
              attorney_firm, attorney_contact, confidentiality, notes)
  on public.ip_assets to authenticated;

-- addIpEvent. Events are recorded, not edited.
revoke insert, update, delete on public.ip_events from authenticated;
grant insert (ip_asset_id, event_date, event_type, due_date, cost, note, author_id)
  on public.ip_events to authenticated;

-- People, roles and settings ------------------------------------------------------

-- updateOwnProfile (full_name, phone); setUserRole, setUserActive, setUserRoleId
-- (admin, also guarded by triggers). Profiles are created by handle_new_user()
-- and never deleted. email mirrors auth.users and can_manage_settings is granted
-- in the database, so neither is writable through the API.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, role, is_active, role_id)
  on public.profiles to authenticated;

-- createRole, renameRole, deleteRole. is_system is also guarded by trigger.
revoke insert, update on public.roles from authenticated;
grant insert (name, description, created_by) on public.roles to authenticated;
grant update (name, description)             on public.roles to authenticated;

-- setRoleFeature is an upsert on (role_id, feature_key). Deleting a role removes
-- its rows by ON DELETE CASCADE, which runs as the table owner.
revoke insert, update, delete on public.role_features from authenticated;
grant insert (role_id, feature_key, can_view, can_edit) on public.role_features to authenticated;
grant update (role_id, feature_key, can_view, can_edit) on public.role_features to authenticated;

-- saveCompanySettings. The singleton row is never inserted or deleted.
revoke insert, update, delete on public.company_settings from authenticated;
grant update (legal_name, trade_name, address_line1, address_line2, city, state_name,
              state_code, pincode, gstin, pan, phone, email, website, bank_name,
              bank_account_no, bank_ifsc, bank_branch, signatory_name,
              signatory_designation, default_gst_rate, default_currency,
              invoice_terms, msme_no, jurisdiction_city, payment_terms,
              delivery_timeline, quotation_terms, default_installation_scope,
              default_visit_rate, default_visit_count, print_supplier_header)
  on public.company_settings to authenticated;

-- The specification, with its reason --------------------------------------------
--
-- update_order_spec() used to run as the caller, which meant the caller had to
-- hold UPDATE on technical_specification — and anyone who held it could change
-- the specification directly, with no reason in the audit trail. As SECURITY
-- DEFINER it is now the only way to change those two columns. It checks the
-- caller itself, since RLS no longer applies inside it.
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
  if not public.is_active_member() then
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

revoke all on function public.update_order_spec(uuid, text, text, text) from public, anon;
grant execute on function public.update_order_spec(uuid, text, text, text) to authenticated;

-- Verification ---------------------------------------------------------------
--
-- 1. No table in public still grants table-wide INSERT/UPDATE to authenticated
--    except the ones that legitimately need it (expected: none listed).
--      select table_name, privilege_type
--        from information_schema.role_table_grants
--       where table_schema = 'public' and grantee = 'authenticated'
--         and privilege_type in ('INSERT','UPDATE')
--       order by 1, 2;
--
-- 2. As a signed-in staff member (role authenticated), each of these must fail
--    with 42501 "permission denied":
--      update invoices set status = 'issued', doc_no = 'X' where status = 'draft';
--      update orders set order_no = 'X', advance_received = 0;
--      update inquiries set inquiry_no = 'X';
--      update orders set technical_specification = 'X';
--    and every server action must still succeed — see the test run recorded
--    in docs/SECURITY-REVIEW-2026-10.md.
--
-- Rollback (only if a screen breaks and a quick restore is needed; then add the
-- missing column properly):
--   grant insert, update, delete on all tables in schema public to authenticated;
--   revoke insert, update, delete on public.activity_log from authenticated;
--   and restore update_order_spec() as SECURITY INVOKER from
--   20260804_2a_04_order_technical_specification.sql.
