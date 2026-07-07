CREATE OR REPLACE FUNCTION public.merge_staff_position(source_id uuid, target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _reassigned integer := 0;
BEGIN
  -- 1. Authenticated caller required.
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Single canonical authorization gate.
  --    `has_permission` already short-circuits to true for admins,
  --    so no separate admin fallback is needed.
  IF NOT public.has_permission(_uid, 'hr.edit') THEN
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

  -- 4. Audit trail — actor is always the authenticated caller.
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
    NULL;
  END;
END;
$function$;