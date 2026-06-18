
-- Read-only self-audit for expense / treasury flow.
-- Returns a set of checks (id, category, title, status, severity, reason, action).
CREATE OR REPLACE FUNCTION public.expense_treasury_self_audit(_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  id text,
  category text,
  title text,
  status text,
  severity text,
  reason text,
  action text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_count int;
  v_reversed int;
  v_orphan int;
  v_treasury uuid;
  v_user uuid := auth.uid();
BEGIN
  -- 1) Function security context checks
  FOR r IN
    SELECT p.proname,
           p.prosecdef,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'default_treasury_for_branch',
        '_treasury_assert_open_period',
        'add_treasury_tx',
        '_tg_expense_period_guard',
        'tg_expense_after_insert',
        'tg_expense_after_soft_delete'
      )
  LOOP
    -- SECURITY DEFINER check
    id := 'secdef_' || r.proname;
    category := 'security_context';
    title := r.proname || ' runs as SECURITY DEFINER';
    IF r.prosecdef THEN
      status := 'pass'; severity := 'info';
      reason := 'Function is SECURITY DEFINER (' || r.args || ').';
      action := NULL;
    ELSE
      status := 'fail'; severity := 'high';
      reason := 'Function is SECURITY INVOKER — may hit permission errors at runtime.';
      action := 'ALTER FUNCTION public.' || r.proname || '(' || r.args || ') SECURITY DEFINER;';
    END IF;
    RETURN NEXT;

    -- search_path pinned check
    id := 'searchpath_' || r.proname;
    category := 'security_context';
    title := r.proname || ' has search_path pinned';
    IF r.proconfig IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(r.proconfig) cfg WHERE cfg ILIKE 'search_path=%'
    ) THEN
      status := 'pass'; severity := 'info';
      reason := 'search_path is pinned in proconfig.';
      action := NULL;
    ELSE
      status := 'warning'; severity := 'medium';
      reason := 'search_path is not pinned on this SECURITY DEFINER function.';
      action := 'ALTER FUNCTION public.' || r.proname || '(' || r.args || ') SET search_path = public;';
    END IF;
    RETURN NEXT;
  END LOOP;

  -- 2) EXECUTE grants to authenticated
  FOR r IN
    SELECT proname FROM (VALUES
      ('default_treasury_for_branch'),
      ('_treasury_assert_open_period'),
      ('add_treasury_tx')
    ) AS t(proname)
  LOOP
    id := 'grant_' || r.proname;
    category := 'permissions';
    title := r.proname || ' EXECUTE granted to authenticated';
    SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname = r.proname
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
    IF v_count > 0 THEN
      status := 'pass'; severity := 'info';
      reason := 'authenticated role can EXECUTE this function.';
      action := NULL;
    ELSE
      status := 'fail'; severity := 'high';
      reason := 'authenticated role cannot EXECUTE — expense flow will fail.';
      action := 'GRANT EXECUTE ON FUNCTION public.' || r.proname || ' TO authenticated;';
    END IF;
    RETURN NEXT;
  END LOOP;

  -- 3) Branch isolation: helper resolves treasury for the branch
  IF _branch_id IS NOT NULL THEN
    BEGIN
      v_treasury := public.default_treasury_for_branch(_branch_id);
      id := 'default_treasury_resolves';
      category := 'branch_isolation';
      title := 'default_treasury_for_branch returns a treasury';
      IF v_treasury IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.treasury WHERE id = v_treasury AND branch_id = _branch_id;
        IF v_count = 1 THEN
          status := 'pass'; severity := 'info';
          reason := 'Resolved treasury belongs to the requested branch.';
          action := NULL;
        ELSE
          status := 'fail'; severity := 'high';
          reason := 'Resolved treasury does not belong to this branch — branch isolation broken.';
          action := 'Review default_treasury_for_branch filter.';
        END IF;
      ELSE
        status := 'warning'; severity := 'medium';
        reason := 'No default treasury configured for this branch.';
        action := 'Create a treasury for this branch and mark it default.';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      id := 'default_treasury_resolves';
      category := 'branch_isolation';
      title := 'default_treasury_for_branch returns a treasury';
      status := 'fail'; severity := 'critical';
      reason := 'Calling helper raised: ' || SQLERRM;
      action := 'Re-check GRANT EXECUTE and SECURITY DEFINER on default_treasury_for_branch.';
    END;
    RETURN NEXT;
  END IF;

  -- 4) Expense flow integrity: every soft-deleted expense in last 30 days has a reversal
  SELECT count(*) INTO v_count
    FROM public.expenses e
    WHERE e.deleted_at IS NOT NULL
      AND e.deleted_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id);

  SELECT count(*) INTO v_reversed
    FROM public.expenses e
    WHERE e.deleted_at IS NOT NULL
      AND e.deleted_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id)
      AND EXISTS (
        SELECT 1 FROM public.treasury_transactions tt
        WHERE tt.reference_type = 'expense_reversal'
          AND tt.reference_id = e.id
      );

  id := 'soft_delete_reversal';
  category := 'flow_integrity';
  title := 'Soft-deleted expenses have matching treasury reversal';
  v_orphan := v_count - v_reversed;
  IF v_count = 0 THEN
    status := 'pass'; severity := 'info';
    reason := 'No soft-deleted expenses in the last 30 days.';
    action := NULL;
  ELSIF v_orphan = 0 THEN
    status := 'pass'; severity := 'info';
    reason := 'All ' || v_count || ' soft-deleted expenses have reversal transactions.';
    action := NULL;
  ELSE
    status := 'fail'; severity := 'high';
    reason := v_orphan || ' of ' || v_count || ' soft-deleted expenses are missing reversals.';
    action := 'Inspect tg_expense_after_soft_delete trigger and run a manual reversal.';
  END IF;
  RETURN NEXT;

  -- 5) Every recent active expense has a treasury debit
  SELECT count(*) INTO v_count
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND e.created_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id);

  SELECT count(*) INTO v_reversed
    FROM public.expenses e
    WHERE e.deleted_at IS NULL
      AND e.created_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id)
      AND EXISTS (
        SELECT 1 FROM public.treasury_transactions tt
        WHERE tt.reference_type = 'expense'
          AND tt.reference_id = e.id
      );

  id := 'expense_treasury_link';
  category := 'flow_integrity';
  title := 'Active expenses have matching treasury transaction';
  v_orphan := v_count - v_reversed;
  IF v_count = 0 THEN
    status := 'pass'; severity := 'info';
    reason := 'No active expenses in the last 30 days.';
    action := NULL;
  ELSIF v_orphan = 0 THEN
    status := 'pass'; severity := 'info';
    reason := 'All ' || v_count || ' recent expenses have a treasury transaction.';
    action := NULL;
  ELSE
    status := 'warning'; severity := 'medium';
    reason := v_orphan || ' of ' || v_count || ' expenses have no treasury transaction.';
    action := 'Check tg_expense_after_insert trigger and add_treasury_tx logs.';
  END IF;
  RETURN NEXT;

  -- 6) Caller has branch access (read-only sanity check, only when branch supplied)
  IF _branch_id IS NOT NULL AND v_user IS NOT NULL THEN
    id := 'caller_branch_access';
    category := 'branch_isolation';
    title := 'Authenticated user has access to this branch';
    IF public.user_has_branch_access(_branch_id) THEN
      status := 'pass'; severity := 'info';
      reason := 'Current user can operate in this branch.';
      action := NULL;
    ELSE
      status := 'warning'; severity := 'medium';
      reason := 'Current user lacks branch access — expense create would be blocked by RLS.';
      action := 'Assign the user to this branch in staff_branches.';
    END IF;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.expense_treasury_self_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expense_treasury_self_audit(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
