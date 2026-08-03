-- Package A / Fix 0 (ROOT CAUSE): restore the baseline table-level GRANTs.
--
-- Diagnosis: all 122 tables/views in schema public had a NULL relacl, i.e. no
-- privileges granted to ANY role -- not authenticated, not service_role.
-- PostgREST therefore rejected every request with SQLSTATE 42501
-- "permission denied for table ..." BEFORE any RLS policy was ever evaluated.
--
-- Confirmed live before the fix:
--   GET /rest/v1/patients   -> HTTP 401, code 42501
--   GET /rest/v1/invoices   -> HTTP 401, code 42501
--   has_table_privilege('authenticated', 'public.patients', 'SELECT') -> false
--
-- Real-world impact: the application was fully non-functional for every user.
-- Consistent with the observed data freeze (last appointment 2026-06-27,
-- last payment 2026-07-04) and with all 26 reminders sitting in status 'failed'.
--
-- Why this is safe:
--   * RLS is enabled on all 122 tables and is NOT modified here.
--   * 325 existing policies target the `authenticated` role and remain the
--     actual authorization gate. GRANT is only the coarse outer door.
--   * `anon` is deliberately NOT granted anything: zero policies target it and
--     the application requires authentication. Verified post-fix that anon
--     still receives HTTP 401.
--
-- Applied to the live database on 2026-08-03 as migration 20260803085927.
-- Idempotent: safe to re-run.

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Existing objects
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Future objects, so a newly created table is never silently unreachable again
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
