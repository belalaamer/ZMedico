CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT branch_id
  FROM public.staff_profiles
  WHERE linked_user_id = auth.uid()
    AND deleted_at IS NULL
  ORDER BY (status = 'active') DESC NULLS LAST, created_at ASC
  LIMIT 1
$function$;

REVOKE EXECUTE ON FUNCTION public.current_user_branch_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_branch_id() TO authenticated, service_role;