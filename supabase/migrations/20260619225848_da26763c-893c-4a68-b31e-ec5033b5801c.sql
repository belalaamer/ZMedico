
-- 1. Fix ambiguous id reference in expense_treasury_self_audit and refine soft-delete reversal check
CREATE OR REPLACE FUNCTION public.expense_treasury_self_audit(_branch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id text, category text, title text, status text, severity text, reason text, action text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_count int;
  v_reversed int;
  v_orphan int;
  v_treasury uuid;
  v_user uuid := auth.uid();
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('default_treasury_for_branch','_treasury_assert_open_period','add_treasury_tx',
        '_tg_expense_period_guard','tg_expense_after_insert','tg_expense_after_soft_delete')
  LOOP
    id := 'secdef_' || r.proname; category := 'security_context';
    title := r.proname || ' runs as SECURITY DEFINER';
    IF r.prosecdef THEN status:='pass'; severity:='info'; reason:='Function is SECURITY DEFINER ('||r.args||').'; action:=NULL;
    ELSE status:='fail'; severity:='high'; reason:='Function is SECURITY INVOKER.';
      action:='ALTER FUNCTION public.'||r.proname||'('||r.args||') SECURITY DEFINER;'; END IF;
    RETURN NEXT;
    id := 'searchpath_' || r.proname; category := 'security_context';
    title := r.proname || ' has search_path pinned';
    IF r.proconfig IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(r.proconfig) cfg WHERE cfg ILIKE 'search_path=%') THEN
      status:='pass'; severity:='info'; reason:='search_path is pinned in proconfig.'; action:=NULL;
    ELSE status:='warning'; severity:='medium'; reason:='search_path not pinned.';
      action:='ALTER FUNCTION public.'||r.proname||'('||r.args||') SET search_path = public;'; END IF;
    RETURN NEXT;
  END LOOP;

  FOR r IN SELECT proname FROM (VALUES ('default_treasury_for_branch'),('_treasury_assert_open_period'),('add_treasury_tx')) AS t(proname) LOOP
    id:='grant_'||r.proname; category:='permissions';
    title := r.proname || ' EXECUTE granted to authenticated';
    SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=r.proname AND has_function_privilege('authenticated',p.oid,'EXECUTE');
    IF v_count>0 THEN status:='pass'; severity:='info'; reason:='authenticated can EXECUTE.'; action:=NULL;
    ELSE status:='fail'; severity:='high'; reason:='authenticated cannot EXECUTE.';
      action:='GRANT EXECUTE ON FUNCTION public.'||r.proname||' TO authenticated;'; END IF;
    RETURN NEXT;
  END LOOP;

  IF _branch_id IS NOT NULL THEN
    BEGIN
      v_treasury := public.default_treasury_for_branch(_branch_id);
      id:='default_treasury_resolves'; category:='branch_isolation';
      title:='default_treasury_for_branch returns a treasury';
      IF v_treasury IS NOT NULL THEN
        -- Fully qualify to avoid clashing with OUT param `id`
        SELECT count(*) INTO v_count FROM public.treasury t
          WHERE t.id = v_treasury AND t.branch_id = _branch_id;
        IF v_count = 1 THEN status:='pass'; severity:='info';
          reason:='Resolved treasury belongs to the requested branch.'; action:=NULL;
        ELSE status:='fail'; severity:='high';
          reason:='Resolved treasury does not belong to this branch.';
          action:='Review default_treasury_for_branch filter.'; END IF;
      ELSE status:='warning'; severity:='medium';
        reason:='No default treasury configured for this branch.';
        action:='Create a treasury for this branch.'; END IF;
    EXCEPTION WHEN OTHERS THEN
      id:='default_treasury_resolves'; category:='branch_isolation';
      title:='default_treasury_for_branch returns a treasury';
      status:='fail'; severity:='critical';
      reason:='Helper raised: '||SQLERRM;
      action:='Re-check GRANT EXECUTE and SECURITY DEFINER.';
    END;
    RETURN NEXT;
  END IF;

  -- Soft-deleted expenses: only those that had an original treasury 'expense' txn require a reversal.
  SELECT count(*) INTO v_count FROM public.expenses e
    WHERE e.deleted_at IS NOT NULL
      AND e.deleted_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id)
      AND EXISTS (SELECT 1 FROM public.treasury_transactions tt
                  WHERE tt.reference_type='expense' AND tt.reference_id=e.id);

  SELECT count(*) INTO v_reversed FROM public.expenses e
    WHERE e.deleted_at IS NOT NULL
      AND e.deleted_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id)
      AND EXISTS (SELECT 1 FROM public.treasury_transactions tt
                  WHERE tt.reference_type='expense' AND tt.reference_id=e.id)
      AND EXISTS (SELECT 1 FROM public.treasury_transactions tt
                  WHERE tt.reference_type='expense_reversal' AND tt.reference_id=e.id);

  id:='soft_delete_reversal'; category:='flow_integrity';
  title:='Soft-deleted expenses have matching treasury reversal';
  v_orphan := v_count - v_reversed;
  IF v_count = 0 THEN status:='pass'; severity:='info';
    reason:='No soft-deleted expenses with original treasury txns in the last 30 days.'; action:=NULL;
  ELSIF v_orphan = 0 THEN status:='pass'; severity:='info';
    reason:='All '||v_count||' eligible soft-deleted expenses have reversal transactions.'; action:=NULL;
  ELSE status:='fail'; severity:='high';
    reason:=v_orphan||' of '||v_count||' soft-deleted expenses are missing reversals.';
    action:='Inspect tg_expense_after_soft_delete trigger.'; END IF;
  RETURN NEXT;

  SELECT count(*) INTO v_count FROM public.expenses e
    WHERE e.deleted_at IS NULL AND e.created_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id);
  SELECT count(*) INTO v_reversed FROM public.expenses e
    WHERE e.deleted_at IS NULL AND e.created_at >= now() - interval '30 days'
      AND (_branch_id IS NULL OR e.branch_id = _branch_id)
      AND EXISTS (SELECT 1 FROM public.treasury_transactions tt
                  WHERE tt.reference_type='expense' AND tt.reference_id=e.id);
  id:='expense_treasury_link'; category:='flow_integrity';
  title:='Active expenses have matching treasury transaction';
  v_orphan := v_count - v_reversed;
  IF v_count = 0 THEN status:='pass'; severity:='info'; reason:='No active expenses in last 30 days.'; action:=NULL;
  ELSIF v_orphan = 0 THEN status:='pass'; severity:='info';
    reason:='All '||v_count||' recent expenses have a treasury transaction.'; action:=NULL;
  ELSE status:='warning'; severity:='medium';
    reason:=v_orphan||' of '||v_count||' expenses have no treasury transaction.';
    action:='Check tg_expense_after_insert.'; END IF;
  RETURN NEXT;

  IF _branch_id IS NOT NULL AND v_user IS NOT NULL THEN
    id:='caller_branch_access'; category:='branch_isolation';
    title:='Authenticated user has access to this branch';
    IF public.user_has_branch_access(_branch_id) THEN status:='pass'; severity:='info';
      reason:='Current user can operate in this branch.'; action:=NULL;
    ELSE status:='warning'; severity:='medium';
      reason:='Current user lacks branch access.';
      action:='Assign user to this branch.'; END IF;
    RETURN NEXT;
  END IF;
  RETURN;
END;
$function$;

-- 2. Reschedule detect-queue-alerts cron with Authorization header so heartbeat refreshes
-- A clean local database has no prior job. Remove it only when it exists,
-- then recreate the named job below.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'detect-queue-alerts-every-5min';
SELECT cron.schedule(
  'detect-queue-alerts-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mmlnvypctowdlbvbesui.supabase.co/functions/v1/detect-queue-alerts',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tbG52eXBjdG93ZGxidmJlc3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDQzMjYsImV4cCI6MjA5MzIyMDMyNn0.0zS5b6E3BJ_kVCK4vHvAyN6gB02GdOwjdlcLjvU8g90',
      'Authorization','Bearer ' || public._get_cron_secret()
    ),
    body := jsonb_build_object('ts', now())
  ) AS request_id;
  $$
);
