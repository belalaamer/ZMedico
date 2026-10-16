-- Read-only evidence only; NOT an approval or migration runner.
-- Re-run immediately before any individually approved deployment.
begin read only;
select
  to_regprocedure('public.current_user_effective_permissions()') is null as candidate_rpc_absent,
  to_regnamespace('zmedico_authz_self') is null as private_schema_absent,
  md5(pg_get_functiondef('zmedico_security.session_is_active()'::regprocedure))
    = '4a77243167edf154de0192c7105f8bde' as reviewed_session_guard_matches,
  md5(pg_get_functiondef('public.assert_active_session()'::regprocedure))
    = 'cd7553f3ade0585ecbe09631d1140bb2' as reviewed_invoker_assertion_matches,
  md5(pg_get_functiondef('public.has_role(uuid,public.app_role)'::regprocedure))
    = 'fce840b631d7214b9f468c044ced561f' as reviewed_role_semantics_match,
  (select 'security_invoker=true'=any(reloptions)
    from pg_class where oid='public.v_authz_effective_permissions'::regclass) as original_view_still_invoker,
  (select count(*)=4 and bool_and(not p.polpermissive)
    from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relnamespace='public'::regnamespace
      and c.relname in ('authz_role_bundles','authz_bundle_implies','authz_bundle_permissions','authz_permissions')
      and p.polname='rls_hardening_platform_authz') as four_restrictive_catalog_policies;
rollback;
-- Every result must be true, AND exact predicates/ACLs must be reviewed.
-- An unexpected result means stop and re-review, never repair production history.
