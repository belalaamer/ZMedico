-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260925110342
-- name: revoke_view_write_grants
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Restore least-privilege grants on read-only/safe projection views.
--
-- These views were created as SELECT surfaces. Later broad baseline grants
-- reintroduced INSERT/UPDATE/DELETE privileges even though writes belong on
-- the underlying RBAC-protected tables or dedicated RPCs.

REVOKE INSERT, UPDATE, DELETE
ON public.staff_profiles_self
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.payroll_self
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.staff_profiles_directory
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.safe_notification_settings
FROM PUBLIC, anon, authenticated;

-- Keep the intended read contracts explicit.
GRANT SELECT ON public.staff_profiles_self TO authenticated, service_role;
GRANT SELECT ON public.payroll_self TO authenticated, service_role;
GRANT SELECT ON public.staff_profiles_directory TO authenticated, service_role;
GRANT SELECT ON public.safe_notification_settings TO authenticated, service_role;

