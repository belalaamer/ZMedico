
-- ============ ENUM ============
CREATE TYPE public.wallet_tx_type AS ENUM (
  'topup', 'spend', 'refund', 'referral_reward', 'adjustment_credit', 'adjustment_debit'
);

-- ============ TABLES ============
CREATE TABLE public.patient_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency text NOT NULL DEFAULT 'EGP',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_wallets TO authenticated;
GRANT ALL ON public.patient_wallets TO service_role;
ALTER TABLE public.patient_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_select_auth" ON public.patient_wallets FOR SELECT TO authenticated USING (true);
-- No client write policies; only SECURITY DEFINER function writes.

CREATE TABLE public.patient_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  tx_type public.wallet_tx_type NOT NULL,
  direction smallint NOT NULL CHECK (direction IN (-1, 1)),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  balance_after numeric(14,2) NOT NULL,
  reference_type text,
  reference_id uuid,
  notes_en text,
  notes_ar text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_wallet_transactions TO authenticated;
GRANT ALL ON public.patient_wallet_transactions TO service_role;
ALTER TABLE public.patient_wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_tx_select_auth" ON public.patient_wallet_transactions FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies — append-only via SECURITY DEFINER function.

CREATE INDEX idx_wallet_tx_patient_created ON public.patient_wallet_transactions(patient_id, created_at DESC);

-- Idempotency partial unique indexes
CREATE UNIQUE INDEX uq_wallet_tx_payment_topup
  ON public.patient_wallet_transactions(reference_id)
  WHERE reference_type = 'payment' AND tx_type = 'topup';
CREATE UNIQUE INDEX uq_wallet_tx_payment_spend
  ON public.patient_wallet_transactions(reference_id)
  WHERE reference_type = 'payment' AND tx_type = 'spend';
CREATE UNIQUE INDEX uq_wallet_tx_payment_refund
  ON public.patient_wallet_transactions(reference_id)
  WHERE reference_type = 'payment' AND tx_type = 'refund';
CREATE UNIQUE INDEX uq_wallet_tx_referral_reward
  ON public.patient_wallet_transactions(reference_id)
  WHERE reference_type = 'referral' AND tx_type = 'referral_reward';

CREATE TABLE public.loyalty_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  referral_reward_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (referral_reward_amount >= 0),
  referral_reward_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_settings TO authenticated;
GRANT ALL ON public.loyalty_settings TO service_role;
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_settings_select_auth" ON public.loyalty_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "loyalty_settings_update_admin" ON public.loyalty_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
INSERT INTO public.loyalty_settings(id, referral_reward_amount, referral_reward_active) VALUES (1, 0, false);

CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON public.patient_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_loyalty_settings_updated_at BEFORE UPDATE ON public.loyalty_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ COLUMN ADDITIONS ============
ALTER TABLE public.patients
  ADD COLUMN referred_by_patient_id uuid NULL REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD CONSTRAINT patients_no_self_referral CHECK (referred_by_patient_id IS NULL OR referred_by_patient_id <> id);

ALTER TABLE public.payments
  ADD COLUMN is_wallet_topup boolean NOT NULL DEFAULT false,
  ADD COLUMN wallet_credit_tx_id uuid NULL,
  ADD CONSTRAINT payments_topup_not_wallet_method
    CHECK (NOT (is_wallet_topup = true AND payment_method = 'wallet'::public.payment_method));

-- ============ apply_wallet_tx RPC ============
CREATE OR REPLACE FUNCTION public.apply_wallet_tx(
  _patient_id uuid,
  _tx_type public.wallet_tx_type,
  _amount numeric,
  _reference_type text,
  _reference_id uuid,
  _notes_en text,
  _notes_ar text,
  _branch_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dir smallint;
  cur numeric(14,2);
  new_bal numeric(14,2);
  new_id uuid;
BEGIN
  IF _patient_id IS NULL THEN RAISE EXCEPTION 'patient_id required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;

  -- Role gate
  IF _tx_type IN ('adjustment_credit','adjustment_debit') THEN
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Forbidden: only admin can post manual wallet adjustments';
    END IF;
  ELSE
    IF NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    ) THEN
      RAISE EXCEPTION 'Forbidden: insufficient role for wallet operation';
    END IF;
  END IF;

  -- Direction by tx_type
  dir := CASE _tx_type
    WHEN 'topup' THEN 1
    WHEN 'refund' THEN -1
    WHEN 'spend' THEN -1
    WHEN 'referral_reward' THEN 1
    WHEN 'adjustment_credit' THEN 1
    WHEN 'adjustment_debit' THEN -1
  END;

  -- Ensure wallet row exists, lock it
  INSERT INTO public.patient_wallets(patient_id, balance)
    VALUES (_patient_id, 0)
    ON CONFLICT (patient_id) DO NOTHING;

  SELECT balance INTO cur FROM public.patient_wallets WHERE patient_id = _patient_id FOR UPDATE;

  new_bal := cur + (dir * _amount);
  IF new_bal < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance: have %, need %', cur, _amount;
  END IF;

  INSERT INTO public.patient_wallet_transactions(
    patient_id, branch_id, tx_type, direction, amount, balance_after,
    reference_type, reference_id, notes_en, notes_ar, created_by
  ) VALUES (
    _patient_id, _branch_id, _tx_type, dir, _amount, new_bal,
    _reference_type, _reference_id, _notes_en, _notes_ar, auth.uid()
  ) RETURNING id INTO new_id;

  UPDATE public.patient_wallets SET balance = new_bal, updated_at = now() WHERE patient_id = _patient_id;

  RETURN new_id;
END;
$$;

-- ============ Modify tg_payment_after_insert to skip Treasury on wallet spend ============
CREATE OR REPLACE FUNCTION public.tg_payment_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  t uuid;
  is_cash boolean;
  is_wallet_spend boolean;
begin
  t := new.treasury_id;
  if t is null and new.branch_id is not null then
    t := public.default_treasury_for_branch(new.branch_id);
    if t is not null then
      update public.payments set treasury_id = t where id = new.id;
    end if;
  end if;

  is_wallet_spend := (new.payment_method = 'wallet'::public.payment_method AND new.is_wallet_topup = false);

  if t is not null and not is_wallet_spend then
    is_cash := (new.payment_method = 'cash'::public.payment_method);
    perform public.add_treasury_tx(
      t, 'income'::treasury_tx_type, new.amount,
      'payment', new.id,
      'Payment received #' || coalesce(new.reference_number, substring(new.id::text,1,8)),
      'دفعة مستلمة #' || coalesce(new.reference_number, substring(new.id::text,1,8)),
      new.received_by,
      is_cash
    );
  end if;

  if new.invoice_id is not null then
    perform public.recalc_invoice_payments(new.invoice_id);
  end if;
  return new;
end;
$function$;

-- ============ Wallet credit/spend trigger on payments ============
CREATE OR REPLACE FUNCTION public.tg_payment_after_insert_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ledger_id uuid;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  -- Wallet top-up
  IF NEW.is_wallet_topup = true AND NEW.patient_id IS NOT NULL THEN
    BEGIN
      ledger_id := public.apply_wallet_tx(
        NEW.patient_id, 'topup'::public.wallet_tx_type, NEW.amount,
        'payment', NEW.id,
        'Wallet top-up via payment #' || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
        'شحن المحفظة عبر دفعة #' || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
        NEW.branch_id
      );
      UPDATE public.payments SET wallet_credit_tx_id = ledger_id WHERE id = NEW.id;
    EXCEPTION WHEN unique_violation THEN
      -- Already credited (idempotent)
      NULL;
    END;
    RETURN NEW;
  END IF;

  -- Wallet spend (paying an invoice using wallet balance)
  IF NEW.payment_method = 'wallet'::public.payment_method AND NEW.is_wallet_topup = false
     AND NEW.patient_id IS NOT NULL THEN
    BEGIN
      PERFORM public.apply_wallet_tx(
        NEW.patient_id, 'spend'::public.wallet_tx_type, NEW.amount,
        'payment', NEW.id,
        'Wallet spend on payment #' || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
        'سحب من المحفظة لدفعة #' || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
        NEW.branch_id
      );
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_after_insert_wallet
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_after_insert_wallet();

-- ============ Wallet refund on payment soft-delete ============
CREATE OR REPLACE FUNCTION public.tg_payment_after_soft_delete_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Reverse a top-up: debit wallet (refund)
    IF OLD.is_wallet_topup = true AND OLD.wallet_credit_tx_id IS NOT NULL THEN
      BEGIN
        PERFORM public.apply_wallet_tx(
          OLD.patient_id, 'refund'::public.wallet_tx_type, OLD.amount,
          'payment', OLD.id,
          'Reversal of wallet top-up (payment deleted)',
          'عكس شحن المحفظة (تم حذف الدفعة)',
          OLD.branch_id
        );
      EXCEPTION WHEN unique_violation THEN NULL;
            WHEN OTHERS THEN RAISE;
      END;
    END IF;
    -- Reverse a wallet spend: credit wallet back via adjustment_credit
    IF OLD.payment_method = 'wallet'::public.payment_method AND OLD.is_wallet_topup = false THEN
      BEGIN
        PERFORM public.apply_wallet_tx(
          OLD.patient_id, 'adjustment_credit'::public.wallet_tx_type, OLD.amount,
          'payment', OLD.id,
          'Reversal of wallet spend (payment deleted)',
          'عكس سحب من المحفظة (تم حذف الدفعة)',
          OLD.branch_id
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_after_soft_delete_wallet
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_after_soft_delete_wallet();

-- ============ Referral reward trigger ============
CREATE OR REPLACE FUNCTION public.tg_invoice_after_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer uuid;
  cfg RECORD;
  prior_count int;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.status <> 'paid'::public.invoice_status THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT referred_by_patient_id INTO referrer FROM public.patients WHERE id = NEW.patient_id;
  IF referrer IS NULL OR referrer = NEW.patient_id THEN RETURN NEW; END IF;

  SELECT * INTO cfg FROM public.loyalty_settings WHERE id = 1;
  IF cfg IS NULL OR cfg.referral_reward_active = false OR cfg.referral_reward_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- First paid invoice ever for the referred patient?
  SELECT count(*) INTO prior_count FROM public.invoices
    WHERE patient_id = NEW.patient_id
      AND status = 'paid'::public.invoice_status
      AND deleted_at IS NULL
      AND id <> NEW.id;
  IF prior_count > 0 THEN RETURN NEW; END IF;

  BEGIN
    PERFORM public.apply_wallet_tx(
      referrer, 'referral_reward'::public.wallet_tx_type, cfg.referral_reward_amount,
      'referral', NEW.id,
      'Referral reward: referred patient ' || NEW.patient_id::text || ' first paid invoice ' || NEW.invoice_number,
      'مكافأة إحالة: أول فاتورة مدفوعة للمريض المُحال ' || NEW.invoice_number,
      NEW.branch_id
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoice_after_referral_reward
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_after_referral_reward();
