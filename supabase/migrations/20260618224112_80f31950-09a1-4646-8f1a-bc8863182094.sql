
CREATE OR REPLACE FUNCTION public.tg_expense_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t uuid;
  v_is_cash boolean;
BEGIN
  t := NEW.treasury_id;
  IF t IS NULL THEN
    t := public.default_treasury_for_branch(NEW.branch_id);
    IF t IS NOT NULL THEN
      UPDATE public.expenses SET treasury_id = t WHERE id = NEW.id;
    END IF;
  END IF;
  IF t IS NULL THEN
    RAISE EXCEPTION 'Expense % has no treasury and no default treasury for branch %', NEW.id, NEW.branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Map payment method to cash vs non-cash bucket.
  -- Only literal 'cash' debits the cash balance; card / bank_transfer / treasury / any
  -- other non-cash method debits the non-cash balance.
  v_is_cash := (coalesce(NEW.payment_method, 'cash') = 'cash');

  PERFORM public.add_treasury_tx(
    t, 'expense'::treasury_tx_type, NEW.amount,
    'expense', NEW.id,
    coalesce(NEW.description_en, 'Expense'),
    coalesce(NEW.description_ar, 'مصروف'),
    NEW.created_by,
    v_is_cash);
  RETURN NEW;
END; $function$;

NOTIFY pgrst, 'reload schema';
