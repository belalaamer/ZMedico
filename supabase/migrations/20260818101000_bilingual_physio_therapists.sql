-- Return bilingual therapist names while preserving the existing RPC name and
-- branch authorization contract used by the physiotherapy screens.
DROP FUNCTION IF EXISTS public.list_therapists(uuid);

CREATE OR REPLACE FUNCTION public.list_therapists(_branch_id uuid)
RETURNS TABLE(id uuid, full_name text, full_name_en text, full_name_ar text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to branch %', _branch_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sp.id,
    COALESCE(p.full_name, sp.employee_id, sp.id::text) AS full_name,
    p.full_name_en,
    p.full_name_ar
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
END;
$function$;

REVOKE ALL ON FUNCTION public.list_therapists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_therapists(uuid) TO authenticated;
