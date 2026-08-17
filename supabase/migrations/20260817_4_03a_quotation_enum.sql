-- Phase 4, part 2 (a of b) — the enum value, alone.
--
-- `alter type ... add value` may run inside a transaction, but the new label
-- cannot be USED until that transaction commits. Everything in 4_03b refers to
-- 'quotation' in constraints and function bodies, so the label has to land in
-- its own migration first. Applying 4_03b without this one will fail with
-- "invalid input value for enum document_type".

alter type public.document_type add value if not exists 'quotation';
