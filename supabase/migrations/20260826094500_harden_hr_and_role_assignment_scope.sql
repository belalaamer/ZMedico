-- Harden remaining identity paths discovered during the Amr workspace audit.
-- Prevent HR profile/staff policies and settings_assign_user_role from becoming
-- cross-tenant bypasses. No clinical or financial data is modified.

BEGIN;

-- HR must be branch-scoped just like every other clinic role.
DROP POLICY IF EXISTS hr_profiles_select ON public.profiles;
CREATE POLICY hr_profiles_select_scoped ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr'::public.app_role)
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.staff_branches actor_sb
        JOIN public.staff_branches target_sb
          ON target_sb.branch_id = actor_sb.branch_id
        WHERE actor_sb.user_id = auth.uid()
          AND target_sb.user_id = profiles.id
          AND public.user_has_branch_access(actor_sb.branch_id)
      )
    )
  );

DROP POLICY IF EXISTS hr_staff_select ON public.staff_profiles;
CREATE POLICY hr_staff_select ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr'::public.app_role)
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
    )
  );

DROP POLICY IF EXISTS hr_staff_insert ON public.staff_profiles;
CREATE POLICY hr_staff_insert ON public.staff_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      (public.has_role(auth.uid(), 'hr'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role))
      AND branch_id IS NOT NULL
      AND public.user_has_branch_access(branch_id)
    )
  );

DROP POLICY IF EXISTS hr_staff_update ON public.staff_profiles;
CREATE POLICY hr_staff_update ON public.staff_profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'hr'::public.app_role)
      AND branch_id IS NOT NULL
      AND public.user_has_branch_access(branch_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'hr'::public.app_role)
      AND branch_id IS NOT NULL
      AND public.user_has_branch_access(branch_id)
    )
  );

-- settings_assign_user_role is a SECURITY DEFINER RPC. Keep it available for
-- the UI, but require the caller to operate inside the target user's branch,
-- and reserve system_owner assignment for the global System Owner.
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
  v_scope_branch uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'not authorized to assign user roles' USING ERRCODE = '42501';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user id is required' USING ERRCODE = '22004';
  END IF;

  SELECT role::text INTO v_prev_role
    FROM public.user_roles WHERE user_id = _target_user_id LIMIT 1;
  SELECT branch_id, employee_id INTO v_prev_branch, v_prev_emp
    FROM public.staff_profiles WHERE id = _target_user_id LIMIT 1;

  v_scope_branch := COALESCE(_branch_id, v_prev_branch);

  IF public.has_role(v_actor, 'system_owner') THEN
    NULL;
  ELSE
    IF _new_role = 'system_owner'::public.app_role THEN
      RAISE EXCEPTION 'only the System Owner may grant the system_owner role' USING ERRCODE = '42501';
    END IF;
    IF v_scope_branch IS NULL OR NOT public.user_has_branch_access(v_scope_branch) THEN
      RAISE EXCEPTION 'target branch is outside the caller scope' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_branches
      WHERE user_id = _target_user_id AND branch_id = v_scope_branch
    ) THEN
      RAISE EXCEPTION 'target user is not assigned to the caller branch' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;

  IF _new_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (_target_user_id, _new_role);
  END IF;

  IF _branch_id IS NOT NULL THEN
    v_emp_code := v_prev_emp;
    IF v_emp_code IS NULL THEN
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
        SET branch_id = EXCLUDED.branch_id,
            employee_id = COALESCE(public.staff_profiles.employee_id, EXCLUDED.employee_id);
  END IF;

  INSERT INTO public.audit_logs (
    user_id, branch_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    v_actor,
    COALESCE(_branch_id, v_prev_branch),
    CASE
      WHEN _new_role IS NULL THEN 'user_role_cleared'
      WHEN v_prev_role IS NULL THEN 'user_role_assigned'
      WHEN v_prev_role IS DISTINCT FROM _new_role::text THEN 'user_role_changed'
      ELSE 'user_role_reaffirmed'
    END,
    'user_role_assignment',
    _target_user_id,
    jsonb_build_object('role', v_prev_role, 'branch_id', v_prev_branch, 'employee_id', v_prev_emp),
    jsonb_build_object(
      'role', _new_role,
      'branch_id', COALESCE(_branch_id, v_prev_branch),
      'employee_id', COALESCE((SELECT employee_id FROM public.staff_profiles WHERE id = _target_user_id), v_prev_emp)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settings_assign_user_role(uuid, public.app_role, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settings_assign_user_role(uuid, public.app_role, uuid) TO authenticated;

COMMIT;
