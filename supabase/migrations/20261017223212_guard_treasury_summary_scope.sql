-- ZMED-269: reviewed candidate; apply individually only after specific approval.
-- No data correction, permissions change, or migration-history replay.
DO $preflight$ BEGIN
 IF md5(pg_get_functiondef('public.fn_treasury_day_cash_summary(uuid,date,text)'::regprocedure)) <> '008943f2080c10bcd43e1a73d06bf794' THEN
  RAISE EXCEPTION 'Treasury summary drift; review required';
 END IF;
 IF md5(pg_get_functiondef('zmedico_security.session_is_active()'::regprocedure)) <> '4a77243167edf154de0192c7105f8bde'
 OR md5(pg_get_functiondef('public.has_permission(uuid,text)'::regprocedure)) <> 'acaa996750bb4c6d9240f8517d90f6fe'
 OR md5(pg_get_functiondef('public.user_has_branch_access(uuid)'::regprocedure)) <> '7f2cdef867fe831f64d2bf82f20ca645' THEN
  RAISE EXCEPTION 'Treasury summary authorization dependency drift; review required';
 END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.fn_treasury_day_cash_summary(_treasury_id uuid, _business_date date, _tz text DEFAULT 'Africa/Cairo'::text)
 RETURNS TABLE(opening_cash numeric, cash_income numeric, cash_expense numeric, expected_cash numeric, non_cash_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_actor uuid := auth.uid();
  v_branch uuid;
BEGIN
  -- The invoker-only assert_active_session checks current_user and cannot be
  -- nested in a definer. This private guard checks actual SQL role + signed
  -- claims + current Auth user/session, never the definer owner as authority.
  IF NOT COALESCE(zmedico_security.session_is_active(), false) THEN
    RAISE EXCEPTION 'Authentication session is no longer active' USING ERRCODE='42501';
  END IF;
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'treasury.daily_close.view') THEN
    RAISE EXCEPTION 'Forbidden: missing permission treasury.daily_close.view';
  END IF;

  -- Authorize the requested treasury before any SECURITY DEFINER financial read.
  SELECT t.branch_id INTO v_branch
    FROM public.treasury t
   WHERE t.id=_treasury_id;
  IF v_branch IS NULL OR NOT public.user_has_branch_access(v_branch) THEN
    RAISE EXCEPTION 'Forbidden: treasury outside caller scope' USING ERRCODE='42501';
  END IF;

  day_start := (_business_date::timestamp) AT TIME ZONE tz;
  day_end   := ((_business_date + 1)::timestamp) AT TIME ZONE tz;

  SELECT COALESCE(current_balance, 0) INTO cur_cash
    FROM public.treasury WHERE id = _treasury_id;

  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'income'::public.treasury_tx_type THEN amount
         WHEN transaction_type = 'expense'::public.treasury_tx_type THEN -amount
         ELSE 0 END
  ), 0) INTO net_cash_after_open
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id
     AND is_cash = true
     AND created_at >= day_start;

  v_open := COALESCE(cur_cash, 0) - COALESCE(net_cash_after_open, 0);

  SELECT COALESCE(SUM(amount), 0) INTO v_in
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id AND is_cash = true
     AND transaction_type = 'income'::public.treasury_tx_type
     AND created_at >= day_start AND created_at < day_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_out
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id AND is_cash = true
     AND transaction_type = 'expense'::public.treasury_tx_type
     AND created_at >= day_start AND created_at < day_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_nc
    FROM public.treasury_transactions
   WHERE treasury_id = _treasury_id AND is_cash = false
     AND transaction_type = 'income'::public.treasury_tx_type
     AND created_at >= day_start AND created_at < day_end;

  opening_cash   := v_open;
  cash_income    := v_in;
  cash_expense   := v_out;
  expected_cash  := v_open + v_in - v_out;
  non_cash_total := v_nc;
  RETURN NEXT;
END;
$function$;
