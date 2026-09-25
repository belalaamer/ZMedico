-- Keep patient wallet movements in the patient's own branch.
-- This prevents a multi-branch user from posting a valid patient's wallet
-- transaction into a different branch ledger.
CREATE OR REPLACE FUNCTION public.apply_wallet_tx(
  _patient_id uuid,
  _tx_type public.wallet_tx_type,
  _amount numeric,
  _reference_type text,
  _reference_id uuid,
  _notes_en text,
  _notes_ar text,
  _branch_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _required_perm text;
  _patient_branch_id uuid;
  dir smallint;
  cur numeric(14,2);
  new_bal numeric(14,2);
  new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required' USING ERRCODE = '42501';
  END IF;

  _required_perm := CASE
    WHEN _tx_type IN ('adjustment_credit', 'adjustment_debit') THEN 'patients.delete'
    ELSE 'patients.edit'
  END;
  IF NOT public.has_permission(_uid, _required_perm) THEN
    RAISE EXCEPTION 'Forbidden: missing % permission', _required_perm USING ERRCODE = '42501';
  END IF;

  IF _branch_id IS NULL OR NOT public.user_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Forbidden: a scoped branch is required' USING ERRCODE = '42501';
  END IF;

  SELECT p.branch_id
    INTO _patient_branch_id
    FROM public.patients p
   WHERE p.id = _patient_id
     AND p.deleted_at IS NULL
     AND p.branch_id IS NOT NULL
     AND public.user_has_branch_access(p.branch_id);

  IF _patient_branch_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: patient is outside the caller branch scope'
      USING ERRCODE = '42501';
  END IF;

  IF _patient_branch_id <> _branch_id THEN
    RAISE EXCEPTION 'Forbidden: wallet branch must match the patient branch'
      USING ERRCODE = '42501';
  END IF;

  IF _patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_id required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
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

  SELECT balance INTO cur
    FROM public.patient_wallets
   WHERE patient_id = _patient_id
   FOR UPDATE;

  new_bal := cur + (dir * _amount);
  IF new_bal < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance: have %, need %', cur, _amount;
  END IF;

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
