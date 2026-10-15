DO $$
BEGIN
  IF md5(pg_get_functiondef('public.get_clinic_logo(uuid)'::regprocedure))
       <> '017611086e64f4c98d62bf336c236956' THEN
    RAISE EXCEPTION 'Unexpected get_clinic_logo definition; review drift before applying';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_clinic_logo(_branch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_claim_role text := COALESCE(auth.jwt()->>'role', '');
  v_sql_role text := COALESCE(current_setting('role', true), 'none');
  v_trusted_internal boolean;
  v_logo text;
BEGIN
  IF _branch_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Branch is required for clinic logo lookup';
  END IF;

  v_trusted_internal :=
    (v_claim_role = 'service_role' AND v_sql_role = 'service_role')
    OR (
      v_claim_role = ''
      AND session_user IN ('postgres', 'supabase_admin')
      AND v_sql_role IN ('none', 'postgres', 'supabase_admin')
    );

  IF NOT v_trusted_internal THEN
    IF v_actor IS NULL OR NOT (
      public.has_role(v_actor, 'system_owner'::public.app_role)
      OR public.user_has_branch_access(_branch_id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Clinic logo is outside caller branch scope';
    END IF;
  END IF;

  SELECT cp.logo_url
    INTO v_logo
    FROM public.clinic_profile cp
   WHERE cp.branch_id = _branch_id
   ORDER BY cp.created_at, cp.id
   LIMIT 1;

  RETURN v_logo;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_logo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_logo(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
