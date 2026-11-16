-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260903174421
-- name: patient_portal_accounts_select_policy
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Staff had no way at all to check whether a patient already has a portal
-- account: RLS is enabled on patient_portal_accounts but had zero policies,
-- so every client-side select returned empty for every non-service-role
-- caller. Combined with PatientProfile.tsx having no portal UI at all, this
-- made a successfully-created portal account (confirmed live: the edge
-- function itself works and already wrote a row) completely invisible
-- after the one-time creation popup was closed -- exactly matching the
-- reported "portal login doesn't get created" symptom, which was actually
-- "created but permanently unobservable afterward". Mirrors the same
-- user_has_branch_access(branch_id) branch-scoping already used by every
-- other branch-scoped table (branches, staff_profiles, etc.) and by this
-- same table's own edge function (patient-portal-invite) branch check.
CREATE POLICY patient_portal_accounts_select_scoped
ON public.patient_portal_accounts
FOR SELECT
TO authenticated
USING (public.user_has_branch_access(branch_id));
