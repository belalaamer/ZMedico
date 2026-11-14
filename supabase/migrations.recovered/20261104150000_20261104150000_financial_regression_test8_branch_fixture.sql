-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261104150000
-- name: 20261104150000_financial_regression_test8_branch_fixture
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

Registered 2026-11-06T01:5xZ under owner authorization (same guard as 20261101120000 and 20261104130000). The DDL was applied out of band after the test-8 FAIL recorded in the findings register section 8f, and was verified live in the Production catalog immediately before this row was written: pg_get_functiondef(public.run_financial_regression_tests()) contains both the deterministic branch selection ORDER BY name_en NULLS LAST, id and the new detail text expected %s from branch settings, which exist only in the body this file writes. Published as PR #264, commit 8cd6063. Source of truth for the SQL bytes: supabase/migrations/20261104150000_financial_regression_test8_branch_fixture.sql on branch main, md5 471c107ebfcff87c44211bb818b88a8c, 18691 bytes, 408 lines. This row records applied status only; no DDL was executed by it.
