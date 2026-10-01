-- activity_log carries two identical indexes on created_at descending
-- (activity_log_created_at_desc_idx and activity_log_time_idx). Every change
-- anywhere in the system writes an audit row, so every write paid for both.
-- The performance advisor reports the pair as duplicates and shows
-- activity_log_time_idx as never used; activity_log_created_at_desc_idx stays.
--
-- No data is changed. Dropping an index cannot change what a query returns.

drop index if exists public.activity_log_time_idx;

-- Verification:
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename = 'activity_log';
--   -> activity_log_created_at_desc_idx is still listed; activity_log_time_idx is not.
--
-- Recorded 1 Oct 2026: activity_log_time_idx 0 scans since stats reset,
-- activity_log_created_at_desc_idx 169 scans.
--
-- Rollback:
--   create index activity_log_time_idx on public.activity_log using btree (created_at desc);
