
-- Replace the function: derive day boundaries in the clinic local timezone.
DROP FUNCTION IF EXISTS public.fn_treasury_day_cash_summary(uuid, date);

CREATE OR REPLACE FUNCTION public.fn_treasury_day_cash_summary(
  _treasury_id uuid,
  _business_date date,
  _tz text DEFAULT 'Africa/Cairo'
)
RETURNS TABLE (
  opening_cash numeric(14,2),
  cash_income numeric(14,2),
  cash_expense numeric(14,2),
  expected_cash numeric(14,2),
  non_cash_total numeric(14,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz text := COALESCE(NULLIF(_tz, ''), 'Africa/Cairo');
  cur_cash numeric(14,2);
  day_start timestamptz;
  day_end   timestamptz;
  net_cash_after_open numeric(14,2);
  v_open numeric(14,2);
  v_in   numeric(14,2);
  v_out  numeric(14,2);
  v_nc   numeric(14,2);
BEGIN
  -- Local-wall-clock midnight of business_date in clinic timezone, converted to UTC timestamptz.
  day_start := (_business_date::timestamp) AT TIME ZONE tz;
  day_end   := ((_business_date + 1)::timestamp) AT TIME ZONE tz;

  SELECT COALESCE(current_balance, 0) INTO cur_cash
  FROM public.treasury WHERE id = _treasury_id;

  -- Net cash movement that occurred on/after local-day start (cash only).
  -- opening_cash = current balance reversed back to start-of-local-day.
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'income'::public.treasury_tx_type THEN amount
         WHEN transaction_type = 'expense'::public.treasury_tx_type THEN -amount
         ELSE 0 END
  ), 0)
  INTO net_cash_after_open
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND created_at >= day_start;

  v_open := COALESCE(cur_cash, 0) - COALESCE(net_cash_after_open, 0);

  -- Cash income during the local business day.
  SELECT COALESCE(SUM(amount), 0) INTO v_in
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND transaction_type = 'income'::public.treasury_tx_type
    AND created_at >= day_start AND created_at < day_end;

  -- Cash expense during the local business day.
  SELECT COALESCE(SUM(amount), 0) INTO v_out
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND transaction_type = 'expense'::public.treasury_tx_type
    AND created_at >= day_start AND created_at < day_end;

  -- Non-cash income during the local business day (display only).
  SELECT COALESCE(SUM(amount), 0) INTO v_nc
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = false
    AND transaction_type = 'income'::public.treasury_tx_type
    AND created_at >= day_start AND created_at < day_end;

  opening_cash   := v_open;
  cash_income    := v_in;
  cash_expense   := v_out;
  expected_cash  := v_open + v_in - v_out;
  non_cash_total := v_nc;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_treasury_day_cash_summary(uuid, date, text) TO authenticated, service_role;
