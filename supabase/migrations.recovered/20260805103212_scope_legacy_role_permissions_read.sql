-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260805103212
-- name: scope_legacy_role_permissions_read
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- The catalog-scoping pass tightened authz_permissions, authz_bundles and the
-- rest of the authorization model, but missed public.role_permissions -- the
-- LEGACY permission matrix, 68 rows, still readable with USING (true) by every
-- authenticated user.
--
-- It is not patient data, so this is information disclosure rather than a breach:
-- any signed-in user could enumerate exactly what every role in the clinic is
-- allowed to do, which is reconnaissance material and has no legitimate purpose
-- for a receptionist or a nurse. ISO/IEC 27001:2022 A.5.15 puts the authorization
-- model itself behind need-to-know for the same reason.
--
-- Scoped to settings.view, matching the treatment already applied to the
-- canonical authz_* tables so the two sources of truth are at least consistent
-- in who may read them.
--
-- Note: the app reads its OWN effective permissions through
-- v_authz_effective_permissions and has_permission(), neither of which depends on
-- a client SELECT against this table, so nothing in the UI loses access.

DROP POLICY IF EXISTS "role_permissions readable by authenticated" ON public.role_permissions;

CREATE POLICY "role_permissions readable by settings viewers"
  ON public.role_permissions
  FOR SELECT
  USING (public.has_permission(auth.uid(), 'settings.view'));
