
CREATE OR REPLACE FUNCTION public.list_therapists(_branch_id uuid)
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.id, COALESCE(p.full_name, sp.employee_id, sp.id::text) AS full_name
  FROM public.staff_profiles sp
  LEFT JOIN public.profiles p ON p.id = sp.linked_user_id
  WHERE sp.branch_id = _branch_id
    AND sp.linked_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = sp.linked_user_id
        AND ur.role IN ('doctor'::app_role, 'admin'::app_role)
    )
  ORDER BY 2 NULLS LAST
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.list_therapists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_therapists(uuid) TO authenticated;
