-- Structural contract for trial-request approval provisioning.
-- This test is intentionally data-free and does not call the provisioning RPC.

begin;
create extension if not exists pgtap;
select plan(10);

select has_column('public', 'subscription_requests', 'provisioned_tenant_id', 'subscription request stores the provisioned tenant id');
select has_column('public', 'subscription_requests', 'provisioned_branch_id', 'subscription request stores the provisioned branch id');
select has_column('public', 'subscription_requests', 'provisioned_at', 'subscription request stores the provisioning timestamp');
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'subscription_requests_provisioned_tenant_id_fkey'
      and conrelid = 'public.subscription_requests'::regclass
  ),
  'provisioned tenant id has a foreign key'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'subscription_requests_provisioned_branch_id_fkey'
      and conrelid = 'public.subscription_requests'::regclass
  ),
  'provisioned branch id has a foreign key'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.platform_approve_subscription_request(uuid,text)'::regprocedure
      and prosecdef
      and prosrc like '%platform_create_tenant_onboarding%'
  ),
  'approval RPC is SECURITY DEFINER and delegates to atomic onboarding'
);
select ok(
  has_function_privilege('authenticated', 'public.platform_approve_subscription_request(uuid,text)', 'EXECUTE'),
  'authenticated can execute approval RPC'
);
select ok(
  not has_function_privilege('anon', 'public.platform_approve_subscription_request(uuid,text)', 'EXECUTE'),
  'anon cannot execute approval RPC'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.platform_update_subscription_request(uuid,text,text)'::regprocedure
      and prosrc like '%platform_approve_subscription_request%'
  ),
  'legacy status update delegates approved status to provisioning'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.platform_list_subscription_requests(text)'::regprocedure
      and prosrc like '%provisioned_tenant_id%'
  ),
  'request listing exposes provisioning state'
);

select * from finish();
rollback;
