
-- 1) Table
CREATE TABLE public.treasury_daily_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treasury_id uuid NOT NULL REFERENCES public.treasury(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  opening_cash numeric(14,2) NOT NULL DEFAULT 0,
  expected_cash numeric(14,2) NOT NULL DEFAULT 0,
  counted_cash numeric(14,2) NOT NULL DEFAULT 0,
  variance numeric(14,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
  non_cash_total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treasury_daily_closes_unique_per_day UNIQUE (treasury_id, business_date)
);

CREATE INDEX idx_tdc_branch_date ON public.treasury_daily_closes(branch_id, business_date DESC);
CREATE INDEX idx_tdc_treasury_date ON public.treasury_daily_closes(treasury_id, business_date DESC);

-- 2) GRANTs (no anon; auth-only)
GRANT SELECT, INSERT ON public.treasury_daily_closes TO authenticated;
GRANT ALL ON public.treasury_daily_closes TO service_role;

-- 3) RLS
ALTER TABLE public.treasury_daily_closes ENABLE ROW LEVEL SECURITY;

-- SELECT: admins/managers see all; other staff only their branch
CREATE POLICY "tdc_select_scoped"
ON public.treasury_daily_closes
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR branch_id = public.current_user_branch_id()
);

-- INSERT: admin (any branch) or manager (only their branch)
CREATE POLICY "tdc_insert_admin_or_branch_manager"
ON public.treasury_daily_closes
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND branch_id = public.current_user_branch_id()
  )
);

-- Intentionally NO update/delete policies: close rows are immutable in this phase.

-- 4) updated_at trigger (kept for table-level consistency; rows are not edited from the app)
CREATE TRIGGER trg_tdc_set_updated_at
BEFORE UPDATE ON public.treasury_daily_closes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) Reproducible day cash summary
-- opening_cash  = current treasury cash balance minus net cash movement on/after business_date 00:00 .. <next_day
--                 (i.e., the cash balance as of start-of-day for business_date)
-- expected_cash = opening_cash + cash income on business_date - cash expense on business_date
-- non_cash_total = non-cash income on business_date (display only)
CREATE OR REPLACE FUNCTION public.fn_treasury_day_cash_summary(
  _treasury_id uuid,
  _business_date date
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
  cur_cash numeric(14,2);
  day_start timestamptz;
  day_end   timestamptz;
  net_cash_today numeric(14,2);
  v_open numeric(14,2);
  v_in   numeric(14,2);
  v_out  numeric(14,2);
  v_nc   numeric(14,2);
BEGIN
  day_start := (_business_date::timestamp) AT TIME ZONE 'UTC';
  day_end   := ((_business_date + 1)::timestamp) AT TIME ZONE 'UTC';

  SELECT COALESCE(current_balance, 0) INTO cur_cash
  FROM public.treasury WHERE id = _treasury_id;

  -- Net cash movement that happened on/after start-of-day (cash only)
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'income'::public.treasury_tx_type THEN amount
         WHEN transaction_type = 'expense'::public.treasury_tx_type THEN -amount
         ELSE 0 END
  ), 0)
  INTO net_cash_today
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND created_at >= day_start;

  v_open := COALESCE(cur_cash, 0) - COALESCE(net_cash_today, 0);

  -- Cash income today
  SELECT COALESCE(SUM(amount), 0) INTO v_in
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND transaction_type = 'income'::public.treasury_tx_type
    AND created_at >= day_start AND created_at < day_end;

  -- Cash expense today
  SELECT COALESCE(SUM(amount), 0) INTO v_out
  FROM public.treasury_transactions
  WHERE treasury_id = _treasury_id
    AND is_cash = true
    AND transaction_type = 'expense'::public.treasury_tx_type
    AND created_at >= day_start AND created_at < day_end;

  -- Non-cash income today (display only)
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

GRANT EXECUTE ON FUNCTION public.fn_treasury_day_cash_summary(uuid, date) TO authenticated, service_role;
