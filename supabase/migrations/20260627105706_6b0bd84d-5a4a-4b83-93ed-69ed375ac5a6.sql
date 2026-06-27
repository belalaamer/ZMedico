
-- Add role guards to SECURITY DEFINER RPCs to enforce role-based access

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
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'accountant'::app_role) OR
    public.has_role(auth.uid(), 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;

  day_start := (_business_date::timestamp) AT TIME ZONE tz;
  day_end   := ((_business_date + 1)::timestamp) AT TIME ZONE tz;

  SELECT COALESCE(current_balance, 0) INTO cur_cash
  FROM public.treasury WHERE id = _treasury_id;

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

  SELECT COALESCE(SUM(amount), 0) INTO v_in
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND transaction_type = 'income'::public.treasury_tx_type
    AND created_at >= day_start AND created_at < day_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_out
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND transaction_type = 'expense'::public.treasury_tx_type
    AND created_at >= day_start AND created_at < day_end;

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
$function$;

CREATE OR REPLACE FUNCTION public.apply_coupon_code(_code text, _subtotal numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  disc numeric(14,2) := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'manager'::app_role) OR
    public.has_role(auth.uid(), 'accountant'::app_role) OR
    public.has_role(auth.uid(), 'receptionist'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(_code);
  IF c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error','not_found'); END IF;
  IF NOT c.is_active THEN RETURN jsonb_build_object('ok', false, 'error','disabled'); END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > current_date THEN RETURN jsonb_build_object('ok', false, 'error','not_started'); END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at < current_date THEN RETURN jsonb_build_object('ok', false, 'error','expired'); END IF;
  IF c.usage_limit IS NOT NULL AND c.usage_count >= c.usage_limit THEN RETURN jsonb_build_object('ok', false, 'error','limit_reached'); END IF;
  IF COALESCE(c.min_order_amount,0) > _subtotal THEN
    RETURN jsonb_build_object('ok', false, 'error','min_order', 'min', c.min_order_amount);
  END IF;

  IF c.discount_type = 'percent' THEN
    disc := round(_subtotal * c.discount_value / 100, 2);
  ELSE
    disc := c.discount_value;
  END IF;
  IF c.max_discount_amount IS NOT NULL AND disc > c.max_discount_amount THEN
    disc := c.max_discount_amount;
  END IF;
  IF disc > _subtotal THEN disc := _subtotal; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_amount', disc
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_target_actual(_target_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t record;
  v numeric := 0;
BEGIN
  SELECT * INTO t FROM public.staff_targets WHERE id = _target_id;
  IF t.id IS NULL THEN RETURN 0; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'hr'::app_role) OR
    public.has_role(auth.uid(), 'manager'::app_role) OR
    t.staff_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;

  IF t.metric_type = 'revenue' THEN
    SELECT COALESCE(SUM(i.total),0) INTO v
    FROM public.invoices i
    LEFT JOIN public.medical_records mr ON mr.id = i.medical_record_id
    WHERE i.deleted_at IS NULL
      AND i.invoice_date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR i.branch_id = t.branch_id)
      AND mr.doctor_id = t.staff_id;

  ELSIF t.metric_type = 'collections' THEN
    SELECT COALESCE(SUM(p.amount),0) INTO v
    FROM public.payments p
    WHERE p.deleted_at IS NULL
      AND p.payment_date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR p.branch_id = t.branch_id)
      AND p.received_by = t.staff_id;

  ELSIF t.metric_type = 'appointments_completed' THEN
    SELECT COUNT(*) INTO v
    FROM public.appointments a
    WHERE a.doctor_id = t.staff_id
      AND a.status = 'completed'
      AND a.scheduled_at::date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR a.branch_id = t.branch_id);

  ELSIF t.metric_type = 'procedures_count' THEN
    SELECT COALESCE(SUM(rp.quantity),0) INTO v
    FROM public.record_procedures rp
    JOIN public.medical_records mr ON mr.id = rp.medical_record_id
    WHERE COALESCE(rp.performed_by, mr.doctor_id) = t.staff_id
      AND rp.created_at::date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR mr.branch_id = t.branch_id);

  ELSIF t.metric_type = 'procedures_revenue' THEN
    SELECT COALESCE(SUM(COALESCE(pr.default_price,0) * COALESCE(rp.quantity,1)),0) INTO v
    FROM public.record_procedures rp
    JOIN public.procedures pr ON pr.id = rp.procedure_id
    JOIN public.medical_records mr ON mr.id = rp.medical_record_id
    WHERE COALESCE(rp.performed_by, mr.doctor_id) = t.staff_id
      AND rp.created_at::date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR mr.branch_id = t.branch_id);
  END IF;

  RETURN COALESCE(v,0);
END;
$function$;
