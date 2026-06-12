
-- =====================================================================
-- Treasury / Daily Close Hardening v1
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: assert open period (VOLATILE, default volatility)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._treasury_assert_open_period(
  _branch_id uuid,
  _treasury_id uuid,
  _business_date date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_close date;
BEGIN
  IF _business_date IS NULL THEN
    RETURN;
  END IF;

  SELECT MAX(business_date) INTO last_close
    FROM public.treasury_daily_closes
   WHERE (_treasury_id IS NOT NULL AND treasury_id = _treasury_id)
      OR (_treasury_id IS NULL AND _branch_id IS NOT NULL AND branch_id = _branch_id);

  IF last_close IS NOT NULL AND _business_date <= last_close THEN
    RAISE EXCEPTION 'Cannot record financial movement on % — treasury day is closed (last close: %)',
      _business_date, last_close
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 1. treasury_transactions: append-only
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tg_treasury_tx_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_treasury_tx_mutation', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'treasury_transactions is append-only (op=%)', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS treasury_tx_append_only ON public.treasury_transactions;
CREATE TRIGGER treasury_tx_append_only
  BEFORE UPDATE OR DELETE ON public.treasury_transactions
  FOR EACH ROW EXECUTE FUNCTION public._tg_treasury_tx_append_only();

DROP POLICY IF EXISTS tx_update_admin  ON public.treasury_transactions;
DROP POLICY IF EXISTS tx_admin_delete  ON public.treasury_transactions;

REVOKE UPDATE, DELETE ON public.treasury_transactions FROM authenticated, anon;

-- ---------------------------------------------------------------------
-- 2. treasury: balance drift guard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tg_treasury_balance_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.current_balance IS DISTINCT FROM OLD.current_balance)
     OR (NEW.non_cash_balance IS DISTINCT FROM OLD.non_cash_balance) THEN
    IF current_setting('app.allow_treasury_balance_update', true) <> 'on' THEN
      RAISE EXCEPTION 'treasury balances can only be modified via add_treasury_tx'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treasury_balance_guard ON public.treasury;
CREATE TRIGGER treasury_balance_guard
  BEFORE UPDATE ON public.treasury
  FOR EACH ROW EXECUTE FUNCTION public._tg_treasury_balance_guard();

-- Re-create add_treasury_tx variants to set the LOCAL escape GUC
CREATE OR REPLACE FUNCTION public.add_treasury_tx(
  _treasury_id uuid, _type treasury_tx_type, _amount numeric,
  _ref_type text, _ref_id uuid, _desc_en text, _desc_ar text, _by uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cur numeric(14,2); new_balance numeric(14,2); delta numeric(14,2); new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'receptionist'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;
  PERFORM set_config('app.allow_treasury_balance_update','on', true);

  SELECT current_balance INTO cur FROM public.treasury WHERE id=_treasury_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Treasury % not found', _treasury_id; END IF;
  delta := CASE WHEN _type='income' THEN _amount ELSE -_amount END;
  new_balance := cur + delta;
  INSERT INTO public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar, created_by)
  VALUES (_treasury_id, _type, _amount, new_balance,
          _ref_type, _ref_id, _desc_en, _desc_ar, _by)
  RETURNING id INTO new_id;
  UPDATE public.treasury SET current_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.add_treasury_tx(
  _treasury_id uuid, _type treasury_tx_type, _amount numeric,
  _ref_type text, _ref_id uuid, _desc_en text, _desc_ar text, _by uuid,
  _is_cash boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cur numeric(14,2); new_balance numeric(14,2); delta numeric(14,2); new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'receptionist'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;
  PERFORM set_config('app.allow_treasury_balance_update','on', true);

  IF _is_cash THEN
    SELECT current_balance  INTO cur FROM public.treasury WHERE id=_treasury_id FOR UPDATE;
  ELSE
    SELECT non_cash_balance INTO cur FROM public.treasury WHERE id=_treasury_id FOR UPDATE;
  END IF;
  IF cur IS NULL THEN RAISE EXCEPTION 'Treasury % not found', _treasury_id; END IF;
  delta := CASE WHEN _type='income' THEN _amount ELSE -_amount END;
  new_balance := cur + delta;
  INSERT INTO public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar, created_by, is_cash)
  VALUES (_treasury_id, _type, _amount, new_balance,
          _ref_type, _ref_id, _desc_en, _desc_ar, _by, _is_cash)
  RETURNING id INTO new_id;
  IF _is_cash THEN
    UPDATE public.treasury SET current_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  ELSE
    UPDATE public.treasury SET non_cash_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  END IF;
  RETURN new_id;
END; $$;

-- ---------------------------------------------------------------------
-- 3. treasury_daily_closes: immutable + locked flag
-- ---------------------------------------------------------------------
ALTER TABLE public.treasury_daily_closes
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public._tg_daily_close_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'treasury_daily_closes rows are immutable (op=%)', TG_OP
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS daily_close_immutable ON public.treasury_daily_closes;
CREATE TRIGGER daily_close_immutable
  BEFORE UPDATE OR DELETE ON public.treasury_daily_closes
  FOR EACH ROW EXECUTE FUNCTION public._tg_daily_close_immutable();

REVOKE UPDATE, DELETE ON public.treasury_daily_closes FROM authenticated, anon;

-- ---------------------------------------------------------------------
-- 4. Back-date guard on payments / expenses (INSERT + UPDATE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tg_payment_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.payment_date IS NOT DISTINCT FROM OLD.payment_date
     AND NEW.treasury_id  IS NOT DISTINCT FROM OLD.treasury_id
     AND NEW.branch_id    IS NOT DISTINCT FROM OLD.branch_id THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  t := NEW.treasury_id;
  IF t IS NULL AND NEW.branch_id IS NOT NULL THEN
    t := public.default_treasury_for_branch(NEW.branch_id);
  END IF;
  PERFORM public._treasury_assert_open_period(NEW.branch_id, t, NEW.payment_date);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS payment_period_guard ON public.payments;
CREATE TRIGGER payment_period_guard
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._tg_payment_period_guard();

CREATE OR REPLACE FUNCTION public._tg_expense_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
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
END; $$;

DROP TRIGGER IF EXISTS expense_period_guard ON public.expenses;
CREATE TRIGGER expense_period_guard
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public._tg_expense_period_guard();

-- ---------------------------------------------------------------------
-- 5. Strengthen insert triggers: require treasury impact
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_payment_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t uuid; is_cash boolean; is_wallet_spend boolean;
BEGIN
  is_wallet_spend := (NEW.payment_method = 'wallet'::public.payment_method AND NEW.is_wallet_topup = false);

  t := NEW.treasury_id;
  IF t IS NULL AND NEW.branch_id IS NOT NULL THEN
    t := public.default_treasury_for_branch(NEW.branch_id);
    IF t IS NOT NULL THEN
      UPDATE public.payments SET treasury_id = t WHERE id = NEW.id;
    END IF;
  END IF;

  IF NOT is_wallet_spend AND t IS NULL THEN
    RAISE EXCEPTION 'Payment % has no treasury and no default treasury for branch %', NEW.id, NEW.branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF t IS NOT NULL AND NOT is_wallet_spend THEN
    is_cash := (NEW.payment_method = 'cash'::public.payment_method);
    PERFORM public.add_treasury_tx(
      t, 'income'::treasury_tx_type, NEW.amount,
      'payment', NEW.id,
      'Payment received #' || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
      'دفعة مستلمة #'      || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
      NEW.received_by, is_cash);
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    PERFORM public.recalc_invoice_payments(NEW.invoice_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_expense_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t uuid;
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
  PERFORM public.add_treasury_tx(
    t, 'expense'::treasury_tx_type, NEW.amount,
    'expense', NEW.id,
    coalesce(NEW.description_en, 'Expense'),
    coalesce(NEW.description_ar, 'مصروف'),
    NEW.created_by);
  RETURN NEW;
END; $$;

-- ---------------------------------------------------------------------
-- 6. Soft-delete handlers → additive reversal rows (no deletes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_payment_after_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t uuid;
  r record;
  already_reversed boolean;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    t := NEW.treasury_id;
    IF t IS NULL AND NEW.branch_id IS NOT NULL THEN
      t := public.default_treasury_for_branch(NEW.branch_id);
    END IF;

    IF t IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.treasury_transactions
         WHERE treasury_id = t AND reference_type = 'payment_reversal' AND reference_id = NEW.id
      ) INTO already_reversed;

      IF NOT already_reversed THEN
        FOR r IN
          SELECT amount, is_cash, transaction_type
            FROM public.treasury_transactions
           WHERE treasury_id = t AND reference_type = 'payment' AND reference_id = NEW.id
        LOOP
          PERFORM public.add_treasury_tx(
            t,
            CASE WHEN r.transaction_type = 'income' THEN 'expense' ELSE 'income' END::treasury_tx_type,
            r.amount,
            'payment_reversal', NEW.id,
            'Reversal of payment #' || substring(NEW.id::text,1,8),
            'إلغاء دفعة #'         || substring(NEW.id::text,1,8),
            coalesce(auth.uid(), NEW.received_by),
            r.is_cash);
        END LOOP;
      END IF;
    END IF;

    IF NEW.invoice_id IS NOT NULL THEN
      UPDATE public.invoices i
      SET paid_amount = COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id=i.id AND deleted_at IS NULL),0),
          status = (CASE
            WHEN i.status='cancelled' THEN 'cancelled'
            WHEN COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id=i.id AND deleted_at IS NULL),0) <= 0
              THEN CASE WHEN i.status='draft' THEN 'draft' ELSE 'pending' END
            WHEN COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id=i.id AND deleted_at IS NULL),0) >= i.total
              THEN 'paid'
            ELSE 'partial'
          END)::public.invoice_status
      WHERE i.id = NEW.invoice_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_expense_after_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t uuid;
  r record;
  already_reversed boolean;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    t := NEW.treasury_id;
    IF t IS NULL THEN
      t := public.default_treasury_for_branch(NEW.branch_id);
    END IF;
    IF t IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.treasury_transactions
         WHERE treasury_id = t AND reference_type = 'expense_reversal' AND reference_id = NEW.id
      ) INTO already_reversed;

      IF NOT already_reversed THEN
        FOR r IN
          SELECT amount, is_cash, transaction_type
            FROM public.treasury_transactions
           WHERE treasury_id = t AND reference_type = 'expense' AND reference_id = NEW.id
        LOOP
          PERFORM public.add_treasury_tx(
            t,
            CASE WHEN r.transaction_type='expense' THEN 'income' ELSE 'expense' END::treasury_tx_type,
            r.amount,
            'expense_reversal', NEW.id,
            'Reversal of expense #' || substring(NEW.id::text,1,8),
            'إلغاء مصروف #'         || substring(NEW.id::text,1,8),
            coalesce(auth.uid(), NEW.created_by),
            r.is_cash);
        END LOOP;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- ---------------------------------------------------------------------
-- 7. Audit hooks: treasury_transactions (INSERT) + daily_close (INSERT)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_treasury_tx_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b uuid; act text;
BEGIN
  SELECT branch_id INTO b FROM public.treasury WHERE id = NEW.treasury_id;
  act := CASE
    WHEN NEW.reference_type IN ('manual')                       THEN 'treasury_tx.manual'
    WHEN NEW.reference_type IN ('payment_reversal','expense_reversal') THEN 'treasury_tx.reversal'
    WHEN NEW.reference_type = 'transfer'                        THEN 'treasury_tx.transfer'
    ELSE NULL
  END;
  IF act IS NULL THEN RETURN NEW; END IF;

  PERFORM public._audit_write(
    'treasury_transaction', NEW.id, act,
    NULL,
    jsonb_build_object(
      'id', NEW.id, 'treasury_id', NEW.treasury_id,
      'transaction_type', NEW.transaction_type, 'amount', NEW.amount,
      'is_cash', NEW.is_cash, 'reference_type', NEW.reference_type,
      'reference_id', NEW.reference_id
    ),
    b, NEW.created_by
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS audit_treasury_tx_v2 ON public.treasury_transactions;
CREATE TRIGGER audit_treasury_tx_v2
  AFTER INSERT ON public.treasury_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_treasury_tx_v2();

CREATE OR REPLACE FUNCTION public.audit_treasury_daily_closes_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._audit_write(
    'treasury_daily_close', NEW.id, 'daily_close.create',
    NULL,
    jsonb_build_object(
      'id', NEW.id, 'treasury_id', NEW.treasury_id, 'branch_id', NEW.branch_id,
      'business_date', NEW.business_date, 'opening_cash', NEW.opening_cash,
      'expected_cash', NEW.expected_cash, 'counted_cash', NEW.counted_cash,
      'variance', NEW.variance, 'non_cash_total', NEW.non_cash_total,
      'locked', NEW.locked
    ),
    NEW.branch_id, NEW.closed_by
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS audit_treasury_daily_closes_v2 ON public.treasury_daily_closes;
CREATE TRIGGER audit_treasury_daily_closes_v2
  AFTER INSERT ON public.treasury_daily_closes
  FOR EACH ROW EXECUTE FUNCTION public.audit_treasury_daily_closes_v2();
