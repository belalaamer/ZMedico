CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _branch IS NULL
    OR public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.staff_branches sb
      JOIN public.branches b ON b.id = sb.branch_id
      WHERE sb.user_id = (SELECT auth.uid())
        AND sb.branch_id = _branch
        AND public.tenant_has_active_subscription(b.tenant_id)
    );
$function$;
