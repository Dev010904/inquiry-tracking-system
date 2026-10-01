# Migrations

Every schema change lands here as a file **before** it is applied. Files are
applied by hand in the Supabase SQL editor, in filename order, and never edited
once applied — a correction is a new file.

## Naming

`YYYYMMDD_<phase>_<nn>_<what>.sql` — e.g. `20260804_2a_01_activity_log_summary_note.sql`.
The `nn` fixes the order within a day, because several files usually land together
and some depend on the one before.

## History before this folder

**The first 13 tables have no migration files.** Phase 1's schema — all tables,
RLS policies, helper functions and triggers — was applied directly against
project `vozvdtgsinocrohmasvq` and was never captured as SQL. The live database
is the only record of it. `docs/specs/DATA-MODEL.md` describes what that schema
does, but it is prose, not something you can replay.

Practical consequences, worth knowing before you rely on this folder:

- Running every file here against an empty database will **not** reproduce the
  system. These migrations assume the Phase 1 schema already exists.
- Anything here that modifies a Phase 1 object (a trigger function, a policy)
  must be written against the object's **current definition read out of the live
  database**, not against an assumption of what it contains.

This folder starts the record from Phase 2A onward. It does not backfill the gap.

## Applying a file

1. Read the file top to bottom first. Files that touch existing data state what
   could be lost and carry their own verification queries.
2. Run the **before** query where one is given, and keep the output.
3. Run the migration.
4. Run the **after** query and check it against the stated pass condition.

If a verification query fails its pass condition, stop and report it rather than
continuing to the next file.

## Checking the money survived a migration

Order totals are the one thing no migration may disturb. `pre_phase3.orders`
is a copy of `public.orders` taken before Phase 3 began — see
`20260817_3_00_pre_phase3_snapshot.sql` — and it is the reference the live
table is checked against.

Earlier sessions compared an md5 "fingerprint" of the order money. That is
abandoned: the formula behind the hash was never written down, so a later
session could not reproduce the number and could not tell a real change from a
differently-spelled query. **Compare the rows instead.** It proves more, it
explains itself, and it names the offending order when it fails.

Run this after any migration that touches `orders`, `order_items` or
`recalc_order_value()`:

```sql
select o.order_no,
       o.order_value,     p.order_value     as was_order_value,
       o.gst_amount,      p.gst_amount      as was_gst_amount,
       o.total_with_gst,  p.total_with_gst  as was_total_with_gst
from public.orders o
join pre_phase3.orders p using (id)
where o.order_value    is distinct from p.order_value
   or o.gst_amount     is distinct from p.gst_amount
   or o.total_with_gst is distinct from p.total_with_gst;
```

**Pass condition: zero rows.** `is distinct from` rather than `<>` so a value
that became null is caught rather than silently comparing to unknown.

An order created after the snapshot has no row in `pre_phase3.orders` and so is
not covered by the join. Check that the two sides still line up, and that the
only ids missing are ones you can account for:

```sql
select (select count(*) from public.orders)     as live,
       (select count(*) from pre_phase3.orders) as snapshot,
       (select count(*) from public.orders o
          join pre_phase3.orders p using (id))  as compared;
```

If `live` exceeds `snapshot`, the extra orders are genuinely new and the first
query cannot speak for them. If `compared` is lower than `snapshot`, a
pre-existing order has **lost its id or been deleted** — stop and report it.

## Security rules every migration must follow (from 8_01–8_06, October 2026)

The `20261001_8_*` files close the database to the anonymous key, limit staff
to the columns the app actually writes, and make custom roles real in RLS.
Apply them in order, 8_01 to 8_06; each one stands alone and carries its own
verification and rollback notes. `docs/SECURITY-REVIEW-2026-10.md` explains
why each exists and records the dry run that proved it.

After them, a new migration has to keep these true or it reopens a hole:

1. **Never grant anything to `anon`.** The default privileges no longer do it
   for you; do not add it back by hand. Nothing in this app runs as `anon`.
2. **Writes are granted per column.** `authenticated` holds INSERT/UPDATE only
   on the columns a server action writes (8_02 lists them, per action). If you
   add a column the app writes, add it to the matching `grant insert (…)` /
   `grant update (…)`. A missing grant shows up as *permission denied for table
   X* the first time the screen saves — never fix that with a table-wide grant.
3. **Columns the system owns stay ungranted**: numbers (`inquiry_no`,
   `order_no`, `doc_no`), totals the triggers keep (`order_value` after
   insert, `gst_amount`, `advance_received`, `spent_to_date`, `cost_to_date`),
   approvals and overrides, `created_at`, and everything on `invoices`, which
   only the SECURITY DEFINER document functions write.
4. **Policies ask for the feature, not just for a member.** Use
   `has_feature('<key>')` / `has_any_feature(…)` for reads and
   `has_feature('<key>', true)` / `can_edit_any_feature(…)` for writes, each
   wrapped in `(select …)` so it is evaluated once per query, not once per row.
5. **A SECURITY DEFINER function checks the caller itself** — RLS does not
   apply inside it — sets `search_path`, and is granted to `authenticated`
   only: `revoke all on function … from public, anon` straight after creating
   it. Trigger functions get no grant at all.
6. **Test before applying**: run the migration and the checks in one
   transaction that ends in `raise exception`, as recorded in the security
   review, so nothing is kept until the result is known.
