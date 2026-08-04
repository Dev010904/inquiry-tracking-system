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
