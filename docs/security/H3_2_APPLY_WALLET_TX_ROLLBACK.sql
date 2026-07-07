-- Rollback for Security Hotfix H3-2 (apply_wallet_tx).
-- Restores the pre-hotfix body verbatim. Signature and grants unchanged.
CREATE OR REPLACE FUNCTION public.apply_wallet_tx(
  _patient_id uuid,
  _tx_type wallet_tx_type,
  _amount numeric,
  _reference_type text,
  _reference_id uuid,
  _notes_en text,
  _notes_ar text,
  _branch_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  dir smallint;
  cur numeric(14,2);
  new_bal numeric(14,2);
  new_id uuid;
BEGIN
  IF _patient_id IS NULL THEN RAISE EXCEPTION 'patient_id required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;

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

  dir := CASE _tx_type
    WHEN 'topup' THEN 1
    WHEN 'refund' THEN -1
    WHEN 'spend' THEN -1
    WHEN 'referral_reward' THEN 1
    WHEN 'adjustment_credit' THEN 1
    WHEN 'adjustment_debit' THEN -1
  END;

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
$function$;