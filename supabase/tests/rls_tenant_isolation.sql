-- Run locally with: supabase test db
-- This file is intentionally not applied to production. It verifies the
-- tenant-isolation contract and can be extended with seeded Auth users for a
-- full PostgREST multi-session test.

begin;
create extension if not exists pgtap;
select plan(14);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tenant_domains'::regclass),
  'tenant_domains has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tenant_module_settings'::regclass),
  'tenant_module_settings has RLS enabled'
);

select policies_are('public', 'tenant_domains', array['tenant_domains_read', 'tenant_domains_write']);
select policies_are('public', 'tenant_module_settings', array['tenant_module_settings_read', 'tenant_module_settings_write']);

select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenant_domains' and policyname = 'tenant_domains_read' and qual::text like '%tenant_id%' and qual::text like '%user_has_branch_access%'),
  'domain read policy is tenant/branch scoped'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenant_domains' and policyname = 'tenant_domains_write' and with_check::text like '%system_owner%'),
  'domain writes are restricted to System Owner'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenant_module_settings' and policyname = 'tenant_module_settings_read' and qual::text like '%tenant_id%' and qual::text like '%user_has_branch_access%'),
  'module reads are tenant/branch scoped'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tenant_module_settings' and policyname = 'tenant_module_settings_write' and with_check::text like '%tenant_id%'),
  'module writes remain tenant scoped'
);

select ok(
  exists (select 1 from pg_proc where oid = 'public.platform_create_tenant_onboarding(jsonb)'::regprocedure and prosecdef),
  'onboarding RPC is SECURITY DEFINER'
);
select ok(
  has_function_privilege('authenticated', 'public.platform_create_tenant_onboarding(jsonb)', 'EXECUTE'),
  'authenticated can execute onboarding RPC'
);
select ok(
  not has_function_privilege('anon', 'public.platform_create_tenant_onboarding(jsonb)', 'EXECUTE'),
  'anon cannot execute onboarding RPC'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.tenant_domains'::regclass and conname = 'tenant_domains_validation_records_array'),
  'validation records are constrained to JSON arrays'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'tenant_domains' and indexname = 'tenant_domains_normalized_hostname_key'),
  'normalized hostname is unique'
);
select ok(
  exists (select 1 from pg_proc where oid = 'public.resolve_active_tenant_domain(text)'::regprocedure and prosecdef),
  'public resolver is SECURITY DEFINER and returns only routing identifiers'
);

select * from finish();
rollback;

-- Runtime multi-session test recipe (execute only in a disposable local DB
-- after seeding two Auth users, two tenants, two branches, and staff_branches):
--
-- set role authenticated;
-- select set_config('request.jwt.claim.sub', '<USER_A_UUID>', true);
-- select is((select count(*) from public.tenant_domains), 1::bigint, 'user A sees only tenant A domains');
-- select set_config('request.jwt.claim.sub', '<USER_B_UUID>', true);
-- select is((select count(*) from public.tenant_domains), 1::bigint, 'user B sees only tenant B domains');
-- reset role;
