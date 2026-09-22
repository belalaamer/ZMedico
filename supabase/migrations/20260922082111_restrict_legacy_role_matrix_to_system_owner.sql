CREATE OR REPLACE FUNCTION public.settings_save_role_permissions(_matrix jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor  uuid := auth.uid();
  v_count  integer := 0;
  v_row    jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'only the System Owner may modify the legacy global role-permission matrix'
      USING ERRCODE = '42501';
  END IF;

  IF _matrix IS NULL OR jsonb_typeof(_matrix) <> 'array' THEN
    RAISE EXCEPTION 'matrix must be a jsonb array of {role,module,actions}'
      USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT jsonb_array_elements(_matrix) LOOP
    IF v_row->>'role' IS NULL
       OR v_row->>'module' IS NULL
       OR jsonb_typeof(v_row->'actions') <> 'array' THEN
      RAISE EXCEPTION 'invalid matrix row: %', v_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  WITH src AS (
    SELECT
      (r->>'role') AS role,
      (r->>'module') AS module,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(r->'actions')), '{}'::text[]) AS actions
    FROM jsonb_array_elements(_matrix) AS r
  ),
  ins AS (
    INSERT INTO public.role_permissions (role, module, actions)
    SELECT role, module, actions FROM src
    ON CONFLICT (role, module) DO UPDATE
      SET actions = EXCLUDED.actions,
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM ins;

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, new_values
  ) VALUES (
    v_actor,
    'role_permissions_matrix_saved',
    'role_permissions',
    NULL,
    jsonb_build_object('row_count', v_count, 'diff_hash', md5(_matrix::text))
  );

  RETURN v_count;
END;
$function$;
