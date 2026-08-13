-- Three helpers were reachable over the REST API by any signed-in user even
-- though nothing in the app calls them directly. allocate_document_number is
-- the one that matters: calling it by hand consumes the next invoice number,
-- and an invoice series with gaps in it is a problem at assessment time.
--
-- EXECUTE has to be taken away from PUBLIC. PUBLIC holds it by default, so a
-- revoke aimed only at anon and authenticated leaves the privilege in place
-- and changes nothing.
--
-- The functions still run from inside issue_document, the totals triggers and
-- the QA gate, because those are SECURITY DEFINER and execute as the owner.

revoke all on function public.allocate_document_number(public.document_type, date)
  from public, anon, authenticated;

revoke all on function public.recompute_document_totals(uuid)
  from public, anon, authenticated;

revoke all on function public.qa_check_is_complete(uuid)
  from public, anon, authenticated;
