
CREATE OR REPLACE FUNCTION public.list_doctors()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'doctor'::app_role
  ORDER BY p.full_name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_doctors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_doctors() TO authenticated, service_role;
