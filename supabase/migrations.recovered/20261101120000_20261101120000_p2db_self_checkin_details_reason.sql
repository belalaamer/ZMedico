-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261101120000
-- name: 20261101120000_p2db_self_checkin_details_reason
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

Registered 2026-11-05 under owner authorization. The DDL was applied out of band on 2026-11-01 and was verified live in the Production catalog immediately before this row was written: public.public_self_checkin_details(text) returns TABLE(valid, status, tenant_name_en, tenant_name_ar, branch_name_en, branch_name_ar, scheduled_at, procedure_name, expires_at, reason), the clinic_unavailable branch is present in the body, and EXECUTE is granted to anon, authenticated and service_role. Source of truth for the SQL bytes: supabase/migrations/20261101120000_p2db_self_checkin_details_reason.sql on branch main, md5 83594c7283a327d1851037aedb68a8fe, 4635 bytes, 115 lines. This row records applied status only; no DDL was executed by it.
