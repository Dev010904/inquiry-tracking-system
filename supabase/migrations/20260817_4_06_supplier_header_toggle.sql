-- Whether a printed document carries the supplier's own identity block.
--
-- The sample spreadsheet ANK supplied has no supplier header at all, because
-- ANK prints onto pre-printed letterhead that already carries the name,
-- address and GSTIN. A browser print has no letterhead, and a tax invoice
-- without the supplier's GSTIN is not a valid one — so the block is printed by
-- default and the owner turns it off only for the stationery case.
--
-- Default true, not null: every existing row keeps printing the header exactly
-- as it does today, so this deploys under a live system without changing a
-- single document.
--
-- Note for anyone adding a company_settings column later: saveCompanySettings
-- writes an explicit column list. A new column is silently dropped on save
-- unless it is added there too, and typecheck will not catch it.

alter table public.company_settings
  add column if not exists print_supplier_header boolean not null default true;

comment on column public.company_settings.print_supplier_header is
  'Print the supplier identity block (name, address, GSTIN, PAN) at the head of '
  'every document. Turn off only when printing onto pre-printed letterhead that '
  'already carries those details — a plain print without them is not a valid '
  'tax invoice.';
