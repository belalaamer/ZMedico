CREATE OR REPLACE FUNCTION public.merge_staff_position(source_id uuid, target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _allowed boolean;
  _reassigned integer := 0;
BEGIN
  -- 1. Authenticated caller required (no anonymous, no service-role-without-jwt).
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Server-side authorization. Prefer the new permission service
  --    (`hr.edit`); fall back to the legacy `admin` role check so this
  --    hotfix is safe to ship ahead of full Wave 3E permission rollout.
  _allowed :=
    public.has_permission(_uid, 'hr.edit')
    OR public.has_role(_uid, 'admin'::public.app_role);

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Forbidden: missing hr.edit permission'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Business logic (unchanged).
  IF source_id = target_id THEN
    RETURN;
  END IF;

  UPDATE public.staff_profiles
    SET position_id = target_id
    WHERE position_id = source_id;
  GET DIAGNOSTICS _reassigned = ROW_COUNT;

  UPDATE public.staff_positions
    SET deleted_at = now()
    WHERE id = source_id AND deleted_at IS NULL;

  -- 4. Audit trail. Actor is always the authenticated caller — never
  --    forgeable via parameters.
  BEGIN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      _uid,
      'merge',
      'staff_position',
      source_id,
      jsonb_build_object(
        'source_id', source_id,
        'target_id', target_id,
        'reassigned_count', _reassigned
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let audit-log insert failures roll back the merge.
    NULL;
  END;
END;
$function$;

-- Re-assert least-privilege grants (idempotent).
REVOKE ALL ON FUNCTION public.merge_staff_position(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_staff_position(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_staff_position(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_staff_position(uuid, uuid) TO service_role;