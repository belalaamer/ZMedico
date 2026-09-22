CREATE OR REPLACE FUNCTION public.set_doctor_service_assignments(
  p_doctor_id uuid,
  p_branch_id uuid,
  p_service_ids uuid[],
  p_service_kind text DEFAULT 'service'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_service_id uuid;
  v_kind text := COALESCE(p_service_kind, 'service');
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'manager'::public.app_role))
      AND public.user_has_branch_access(p_branch_id)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_kind NOT IN ('service','procedure') THEN
    RAISE EXCEPTION 'invalid_service_kind' USING ERRCODE = '22023';
  END IF;

  SELECT b.tenant_id INTO v_tenant_id
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.is_active = true
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'branch_unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_branches sb
    JOIN public.user_roles ur ON ur.user_id = sb.user_id
    WHERE sb.user_id = p_doctor_id
      AND sb.branch_id = p_branch_id
      AND ur.role = 'doctor'::public.app_role
  ) THEN
    RAISE EXCEPTION 'doctor_unavailable';
  END IF;

  DELETE FROM public.doctor_service_assignments
  WHERE doctor_id = p_doctor_id
    AND branch_id = p_branch_id
    AND service_kind = v_kind;

  FOREACH v_service_id IN ARRAY COALESCE(p_service_ids, ARRAY[]::uuid[]) LOOP
    IF v_kind = 'service' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.services s
        WHERE s.id = v_service_id
          AND s.tenant_id = v_tenant_id
          AND s.is_active = true
          AND s.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'service_unavailable';
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.procedures pr
        WHERE pr.id = v_service_id
          AND pr.tenant_id = v_tenant_id
          AND pr.is_active = true
          AND pr.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'procedure_unavailable';
      END IF;
    END IF;

    INSERT INTO public.doctor_service_assignments (
      tenant_id, branch_id, doctor_id, service_id, service_kind
    )
    VALUES (
      v_tenant_id, p_branch_id, p_doctor_id, v_service_id, v_kind
    )
    ON CONFLICT (branch_id, doctor_id, service_id, service_kind) DO NOTHING;
  END LOOP;
END;
$function$;
