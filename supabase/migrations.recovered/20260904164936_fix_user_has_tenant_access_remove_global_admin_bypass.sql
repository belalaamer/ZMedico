-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260904164936
-- name: fix_user_has_tenant_access_remove_global_admin_bypass
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _tenant_id IS NOT NULL
    AND public.tenant_has_active_subscription(_tenant_id)
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.staff_branches sb
        JOIN public.branches b ON b.id = sb.branch_id
        WHERE sb.user_id = auth.uid() AND b.tenant_id = _tenant_id
      )
    );
$function$;
