-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260902213745
-- name: settings_assign_user_role_fix_branch_lookup
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

CREATE OR REPLACE FUNCTION public.settings_assign_user_role(_target_user_id uuid, _new_role app_role, _branch_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- RBAC-09 correctness fix: staff_profiles is keyed by its own generated
  -- id, which only equals the auth user id for self-provisioned identities
  -- (admin-create-user / handle_new_user both set id = linked_user_id =
  -- the new auth user's id). The "link an existing HR staff record to a
  -- user" flow deliberately links a staff row whose id is NOT the user's
  -- id (linked_user_id is set instead) -- looking this up by
  -- staff_profiles.id silently missed that row's real branch. staff_branches
  -- (populated by trg_staff_profile_branch_sync off linked_user_id) is the
  -- table every RLS policy actually reads via user_has_branch_access(), so
  -- it is the correct, shape-agnostic source of truth for "does this user
  -- already have a branch".
  SELECT sb.branch_id INTO v_prev_branch
    FROM public.staff_branches sb
    WHERE sb.user_id = _target_user_id
    LIMIT 1;
  SELECT sp.employee_id INTO v_prev_emp
    FROM public.staff_profiles sp
    WHERE sp.id = _target_user_id OR sp.linked_user_id = _target_user_id
    LIMIT 1;

  v_scope_branch := COALESCE(_branch_id, v_prev_branch);

  -- RBAC-09 fix: every operational role must resolve to a branch through
  -- staff_branches -- there is no cross-branch bypass for any role
  -- (including admin) inside public.user_has_branch_access(), which every
  -- branches/staff_profiles/etc. RLS policy calls. Before this check, this
  -- RPC allowed assigning e.g. role='admin' with _branch_id NULL and no
  -- prior branch, silently creating a locked-out identity: RLS returned
  -- zero branches for them (stuck on the "select a workspace" screen) and
  -- User Management's staff_branches-scoped listing never showed them.
  -- Confirmed live against two production tenants (Lunara Clinic, Hady)
  -- before this fix, both reached through UI paths (Create User / Invite /
  -- Edit permissions / Link employee) that assumed admin did not need a
  -- branch. system_owner is the only legitimate exception -- it is
  -- platform-wide by design. Clearing a role (_new_role IS NULL) is always
  -- allowed regardless of branch.
  IF _new_role IS NOT NULL AND _new_role <> 'system_owner'::public.app_role AND v_scope_branch IS NULL THEN
    RAISE EXCEPTION 'a branch is required to assign role %: pass _branch_id or link the user to a branch first', _new_role
      USING ERRCODE = '23514';
  END IF;

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
$function$;
