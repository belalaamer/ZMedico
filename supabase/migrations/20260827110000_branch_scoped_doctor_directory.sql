-- Return doctors attached to one explicit branch only.
-- This is intentionally separate from list_doctors(), which remains available
-- for legacy/platform consumers that explicitly need a global directory.
CREATE OR REPLACE FUNCTION public.list_doctors_for_branch(_branch_id uuid)
RETURNS TABLE(id uuid, full_name text, full_name_en text, full_name_ar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.full_name_en, p.full_name_ar
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'doctor'::app_role
    AND EXISTS (
      SELECT 1
      FROM public.staff_branches doctor_branch
      WHERE doctor_branch.branch_id = _branch_id
        AND doctor_branch.user_id = p.id
    )
    AND (
      public.has_role(auth.uid(), 'system_owner'::app_role)
      OR public.user_has_branch_access(_branch_id)
    )
  ORDER BY COALESCE(p.full_name_en, p.full_name_ar, p.full_name) NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.list_doctors_for_branch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_doctors_for_branch(uuid) TO authenticated, service_role;
