-- Replace fixed payment-method mapping with allocation across cash → non-cash buckets.
-- Allocation: cash first up to available cash balance, remainder posted to non-cash.
-- If neither bucket has enough, the remainder still posts to non-cash (so cash never
-- goes negative just because of a non-cash payment label). Reversal logic is unchanged:
-- it iterates over every treasury_transactions row tied to the expense and refunds the
-- same bucket each row was debited from, so it mirrors the split automatically.

CREATE OR REPLACE FUNCTION public.tg_expense_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t uuid;
  v_cash_balance numeric(14,2);
  v_from_cash    numeric(14,2);
  v_from_noncash numeric(14,2);
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

  -- Allocation: payment_method is only a label. Always deduct from the best available
  -- bucket. Prefer cash when available, then non-cash for the remainder.
  SELECT current_balance INTO v_cash_balance FROM public.treasury WHERE id = t;
  v_cash_balance := coalesce(v_cash_balance, 0);

  IF v_cash_balance >= NEW.amount THEN
    v_from_cash    := NEW.amount;
    v_from_noncash := 0;
  ELSIF v_cash_balance > 0 THEN
    v_from_cash    := v_cash_balance;
    v_from_noncash := NEW.amount - v_cash_balance;
  ELSE
    v_from_cash    := 0;
    v_from_noncash := NEW.amount;
  END IF;

  IF v_from_cash > 0 THEN
    PERFORM public.add_treasury_tx(
      t, 'expense'::treasury_tx_type, v_from_cash,
      'expense', NEW.id,
      coalesce(NEW.description_en, 'Expense'),
      coalesce(NEW.description_ar, 'مصروف'),
      NEW.created_by,
      true);
  END IF;

  IF v_from_noncash > 0 THEN
    PERFORM public.add_treasury_tx(
      t, 'expense'::treasury_tx_type, v_from_noncash,
      'expense', NEW.id,
      coalesce(NEW.description_en, 'Expense'),
      coalesce(NEW.description_ar, 'مصروف'),
      NEW.created_by,
      false);
  END IF;

  RETURN NEW;
END; $function$;