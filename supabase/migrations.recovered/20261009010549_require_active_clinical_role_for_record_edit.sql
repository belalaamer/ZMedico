-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261009010549
-- name: require_active_clinical_role_for_record_edit
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- ZMED-183 proposal: legacy ownership is not a perpetual clinical grant.
-- Preserve draft/owner/deleted/branch restrictions and existing admin override.
do $preflight$
begin
  perform set_config('search_path','',true);
  if not exists (
    select 1 from pg_policy p
    where p.polrelid='public.medical_records'::regclass and p.polname='rec_update_clinical'
      and p.polcmd='w' and p.polpermissive
      and p.polroles=array[(select oid from pg_roles where rolname='authenticated')]
      and md5(pg_get_expr(p.polqual,p.polrelid)||'|'||pg_get_expr(p.polwithcheck,p.polrelid))='527f916de3984876537256d0a1f774d0'
  ) then raise exception 'Clinical edit policy drifted; review before applying'; end if;
end;
$preflight$;

alter policy rec_update_clinical on public.medical_records
using (
  (public.has_role((select auth.uid()),'doctor'::public.app_role)
   or public.has_role((select auth.uid()),'admin'::public.app_role))
  and doctor_id=(select auth.uid())
  and status='draft'::public.medical_record_status and deleted_at is null
)
with check (
  (public.has_role((select auth.uid()),'doctor'::public.app_role)
   or public.has_role((select auth.uid()),'admin'::public.app_role))
  and doctor_id=(select auth.uid())
);

