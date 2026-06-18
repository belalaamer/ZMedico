-- Defense-in-depth: ensure the BEFORE INSERT period guard trigger on expenses
-- runs with elevated privileges so its calls to default_treasury_for_branch
-- and _treasury_assert_open_period succeed regardless of caller role.
CREATE OR REPLACE FUNCTION public._tg_expense_period_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE t uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.expense_date IS NOT DISTINCT FROM OLD.expense_date
     AND NEW.treasury_id  IS NOT DISTINCT FROM OLD.treasury_id
     AND NEW.branch_id    IS NOT DISTINCT FROM OLD.branch_id THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  t := NEW.treasury_id;
  IF t IS NULL AND NEW.branch_id IS NOT NULL THEN
    t := public.default_treasury_for_branch(NEW.branch_id);
  END IF;
  PERFORM public._treasury_assert_open_period(NEW.branch_id, t, NEW.expense_date);
  RETURN NEW;
END; $function$;

-- Re-affirm EXECUTE grants (idempotent) for the functions involved in the expense flow.
GRANT EXECUTE ON FUNCTION public.default_treasury_for_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._treasury_assert_open_period(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_treasury_tx(uuid, treasury_tx_type, numeric, text, uuid, text, text, uuid, boolean) TO authenticated;

-- Ask PostgREST to reload its schema cache so the new permissions take effect immediately.
NOTIFY pgrst, 'reload schema';