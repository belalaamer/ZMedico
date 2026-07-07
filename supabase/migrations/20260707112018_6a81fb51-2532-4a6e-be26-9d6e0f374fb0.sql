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
  _uid uuid := auth.uid();
  _required_perm text;
  dir smallint;
  cur numeric(14,2);
  new_bal numeric(14,2);
  new_id uuid;
BEGIN
  -- 1. Authenticated caller required. Actor is never client-supplied.
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Single canonical authorization gate. Permission key is selected
  --    from business context (tx type) but the auth check itself is one
  --    call to has_permission. Interim mapping preserves the exact
  --    role set the legacy gate allowed:
  --      * regular ops (topup/refund/spend/referral_reward)
  --          -> patients.edit  (admin | manager | receptionist)
  --      * manual adjustments (adjustment_credit/adjustment_debit)
  --          -> patients.delete (admin only)
  --    To be re-keyed to patient_wallet.credit/.debit/.adjust once
  --    PD-05 lands.
  _required_perm := CASE
    WHEN _tx_type IN ('adjustment_credit', 'adjustment_debit')
      THEN 'patients.delete'
    ELSE 'patients.edit'
  END;

  IF NOT public.has_permission(_uid, _required_perm) THEN
    RAISE EXCEPTION 'Forbidden: missing % permission', _required_perm
      USING ERRCODE = '42501';
  END IF;

  -- 3. Business logic — unchanged from prior implementation.
  IF _patient_id IS NULL THEN RAISE EXCEPTION 'patient_id required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;

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

  SELECT balance INTO cur FROM public.patient_wallets
    WHERE patient_id = _patient_id FOR UPDATE;

  new_bal := cur + (dir * _amount);
  IF new_bal < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance: have %, need %', cur, _amount;
  END IF;

  -- Actor (created_by) is derived from auth.uid() — never forgeable.
  INSERT INTO public.patient_wallet_transactions(
    patient_id, branch_id, tx_type, direction, amount, balance_after,
    reference_type, reference_id, notes_en, notes_ar, created_by
  ) VALUES (
    _patient_id, _branch_id, _tx_type, dir, _amount, new_bal,
    _reference_type, _reference_id, _notes_en, _notes_ar, _uid
  ) RETURNING id INTO new_id;

  UPDATE public.patient_wallets
    SET balance = new_bal, updated_at = now()
    WHERE patient_id = _patient_id;

  RETURN new_id;
END;
$function$;