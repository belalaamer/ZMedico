
-- Migration 2 (Settings slice): two SECURITY DEFINER RPCs.
-- No RLS changes. No bundle changes. No catalog changes.

-- =========================================================================
-- 1) settings_assign_user_role
--     Atomically assign (or clear) a user's role and optional branch.
--     Replaces the sequential client writes in UserManagement.tsx:
--       delete user_roles -> insert user_roles
--       [+ upsert staff_profiles(branch_id, employee_id)]
--       [+ upsert employee_id_counter]
--       [+ client audit_logs insert]
-- =========================================================================
CREATE OR REPLACE FUNCTION public.settings_assign_user_role(
  _target_user_id uuid,
  _new_role       public.app_role,
  _branch_id      uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       uuid := auth.uid();
  v_prev_role   text;
  v_prev_branch uuid;
  v_prev_emp    text;
  v_emp_code    text;
  v_next        bigint;
BEGIN
  -- Fail closed: only admins may assign roles.
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'not authorized to assign user roles'
      USING ERRCODE = '42501';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user id is required' USING ERRCODE = '22004';
  END IF;

  -- Snapshot prior state for audit.
  SELECT role::text INTO v_prev_role
    FROM public.user_roles WHERE user_id = _target_user_id LIMIT 1;
  SELECT branch_id, employee_id INTO v_prev_branch, v_prev_emp
    FROM public.staff_profiles WHERE id = _target_user_id LIMIT 1;

  -- Replace role (single row per user in this product).
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;

  IF _new_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (_target_user_id, _new_role);
  END IF;

  -- Optional branch/employee upsert. Only touch staff_profiles when a
  -- branch was supplied; keep unlink semantics separate from role change.
  IF _branch_id IS NOT NULL THEN
    v_emp_code := v_prev_emp;
    IF v_emp_code IS NULL THEN
      -- Advance the shared employee counter atomically inside the txn.
      INSERT INTO public.employee_id_counter (id, last_value)
        VALUES (1, 1)
        ON CONFLICT (id) DO UPDATE
          SET last_value = public.employee_id_counter.last_value + 1
        RETURNING last_value INTO v_next;
      v_emp_code := 'EMP-' || lpad(v_next::text, 4, '0');
    END IF;

    INSERT INTO public.staff_profiles (id, branch_id, employee_id)
      VALUES (_target_user_id, _branch_id, v_emp_code)
      ON CONFLICT (id) DO UPDATE
        SET branch_id   = EXCLUDED.branch_id,
            employee_id = COALESCE(public.staff_profiles.employee_id, EXCLUDED.employee_id);
  END IF;

  -- Single audit entry inside the same transaction.
  INSERT INTO public.audit_logs (
    user_id, branch_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_actor,
    COALESCE(_branch_id, v_prev_branch),
    CASE
      WHEN _new_role IS NULL                       THEN 'user_role_cleared'
      WHEN v_prev_role IS NULL                     THEN 'user_role_assigned'
      WHEN v_prev_role IS DISTINCT FROM _new_role::text THEN 'user_role_changed'
      ELSE 'user_role_reaffirmed'
    END,
    'user_role_assignment',
    _target_user_id,
    jsonb_build_object(
      'role',       v_prev_role,
      'branch_id',  v_prev_branch,
      'employee_id', v_prev_emp
    ),
    jsonb_build_object(
      'role',       _new_role,
      'branch_id',  COALESCE(_branch_id, v_prev_branch),
      'employee_id', COALESCE(
        (SELECT employee_id FROM public.staff_profiles WHERE id = _target_user_id),
        v_prev_emp
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settings_assign_user_role(uuid, public.app_role, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settings_assign_user_role(uuid, public.app_role, uuid) TO authenticated;

COMMENT ON FUNCTION public.settings_assign_user_role(uuid, public.app_role, uuid) IS
  'M2 Settings slice: atomic admin-only role assignment. Fails closed. Writes one audit_logs row.';

-- =========================================================================
-- 2) settings_save_role_permissions
--     Transactional bulk upsert of the role x module -> actions matrix.
--     Replaces the client-side batch upsert in RolePermissions.tsx and
--     eliminates the partial-write hazard (the highest blast-radius write
--     in the product).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.settings_save_role_permissions(
  _matrix jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_count  integer := 0;
  v_row    jsonb;
BEGIN
  -- Fail closed: mirror the RLS boundary on role_permissions writes.
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'settings.edit') THEN
    RAISE EXCEPTION 'not authorized to modify role permissions'
      USING ERRCODE = '42501';
  END IF;

  IF _matrix IS NULL OR jsonb_typeof(_matrix) <> 'array' THEN
    RAISE EXCEPTION 'matrix must be a jsonb array of {role,module,actions}'
      USING ERRCODE = '22023';
  END IF;

  -- Validate shape before any write so a bad payload cannot half-apply.
  FOR v_row IN SELECT jsonb_array_elements(_matrix) LOOP
    IF v_row->>'role'   IS NULL
    OR v_row->>'module' IS NULL
    OR jsonb_typeof(v_row->'actions') <> 'array' THEN
      RAISE EXCEPTION 'invalid matrix row: %', v_row USING ERRCODE = '22023';
    END IF;
  END LOOP;

  WITH src AS (
    SELECT
      (r->>'role')   AS role,
      (r->>'module') AS module,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(r->'actions')),
        '{}'::text[]
      ) AS actions
    FROM jsonb_array_elements(_matrix) AS r
  ),
  ins AS (
    INSERT INTO public.role_permissions (role, module, actions)
    SELECT role, module, actions FROM src
    ON CONFLICT (role, module) DO UPDATE
      SET actions    = EXCLUDED.actions,
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
    jsonb_build_object(
      'row_count', v_count,
      'diff_hash', md5(_matrix::text)
    )
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.settings_save_role_permissions(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settings_save_role_permissions(jsonb) TO authenticated;

COMMENT ON FUNCTION public.settings_save_role_permissions(jsonb) IS
  'M2 Settings slice: transactional role-permissions matrix save. settings.edit only. Writes one audit_logs row.';
