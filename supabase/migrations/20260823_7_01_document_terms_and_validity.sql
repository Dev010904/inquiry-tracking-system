-- Per-document terms: validity, payment terms, delivery, site installation.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- Four things on the printed sheet were wrong for the way the firm actually
-- quotes, and all four came from the same mistake: the terms were treated as
-- properties of the COMPANY when they are properties of the DEAL.
--
--   * The top-right block printed "Payment terms: 15 days". On a quotation the
--     customer is not reading a credit period there — he is reading how long
--     the price holds. The block now prints "Valid till" and a date. The maker
--     still types a number of days, because that is how validity is agreed;
--     the date is derived so nobody has to count on a calendar.
--
--   * "Payment Terms" and "Delivery Timeline" at the foot came from
--     company_settings, so every document that went out carried the same two
--     sentences. They are negotiated per customer. They are now columns on the
--     document, seeded from Settings so the house default still appears, and
--     editable on the draft.
--
--   * The site installation line was one hardcoded English sentence with the
--     rate baked into it: "Site Installation & visit charges @ Rs. 8000/- as
--     extra. Total of 2 visits." Changing the rate meant editing prose. It is
--     now a choice from a list plus two numbers, and the sentence is composed
--     at print time.
--
--   * The list of installation scopes is a table rather than an enum so the
--     owner can add to it from the document screen. Nobody has told us what
--     the options are; that is the point. One seed row reproduces the sentence
--     that is on the paper today, and the rest arrive as they are needed.
--
-- ---------------------------------------------------------------------------
-- What this does NOT do
-- ---------------------------------------------------------------------------
-- No document is renumbered, no total is recomputed, no row is deleted.
-- payment_due_days is RENAMED, not dropped, so every value already stored
-- survives as valid_days. Issued documents stay frozen: the new columns sit on
-- `invoices`, which guard_issued_document() already refuses to update once the
-- status leaves 'draft'.
--
-- Run BEFORE, and keep the output:
--
--   select id, doc_no, status, payment_due_days from invoices order by created_at;
--   select count(*) from invoices;

begin;

-- ---------------------------------------------------------------------------
-- 1. Validity replaces the credit period in the header block
-- ---------------------------------------------------------------------------
alter table public.invoices rename column payment_due_days to valid_days;

comment on column public.invoices.valid_days is
  'How many days from doc_date the document stays valid. The sheet prints the
   resulting date, not this number.';

-- ---------------------------------------------------------------------------
-- 2. Terms that belong to the deal, not to the company
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists payment_terms      text,
  add column if not exists delivery_timeline  text,
  add column if not exists installation_scope text,
  add column if not exists visit_rate         numeric(12,2),
  add column if not exists visit_count        integer;

alter table public.invoices
  add constraint invoices_visit_rate_non_negative
    check (visit_rate is null or visit_rate >= 0),
  add constraint invoices_visit_count_sane
    check (visit_count is null or (visit_count >= 0 and visit_count <= 999));

comment on column public.invoices.payment_terms is
  'Printed payment terms for this document. Seeded from company_settings at
   creation, then editable while the document is a draft.';
comment on column public.invoices.delivery_timeline is
  'Printed delivery timeline for this document. Seeded from company_settings.';
comment on column public.invoices.installation_scope is
  'The chosen installation_options label, copied onto the document rather than
   referenced, so editing the list later cannot rewrite a document already sent.';

-- Nothing is backfilled, deliberately.
--
-- The obvious move is to copy the company-wide sentences onto every existing
-- row. It cannot be done and should not be: guard_issued_document() refuses any
-- update to an issued document, so the statement would abort the migration on
-- the two documents already issued — and if it somehow succeeded it would be
-- rewriting records that are already in a customer's hands.
--
-- The old documents keep their terms because the print layer falls back to
-- supplier_snapshot.payment_terms when the column is null, which is where those
-- sentences were frozen at issue anyway. A document raised from today carries
-- its own copy; one raised before today reads its snapshot. Both print the same
-- words they always did.

-- ---------------------------------------------------------------------------
-- 3. The installation list, addable from the document screen
-- ---------------------------------------------------------------------------
create table if not exists public.installation_options (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique check (btrim(label) <> '' and length(label) <= 200),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.installation_options enable row level security;

create policy installation_options_select on public.installation_options
  for select using (public.is_active_member());

-- Anyone who can raise a document can add a scope: the whole point is that the
-- list grows while the quotation is being written, not through a support call.
create policy installation_options_insert on public.installation_options
  for insert with check (public.is_active_member());

create policy installation_options_update on public.installation_options
  for update using (public.is_admin()) with check (public.is_admin());

create policy installation_options_delete on public.installation_options
  for delete using (public.is_admin());

-- The sentence that is on the paper today, so nothing is lost on day one.
insert into public.installation_options (label, sort_order)
values ('Site Installation & visit charges', 10)
on conflict (label) do nothing;

commit;
