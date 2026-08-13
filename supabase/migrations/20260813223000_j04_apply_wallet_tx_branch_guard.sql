-- Security remediation: J-04 (RBAC audit)
--
-- Finding: public.apply_wallet_tx(_patient_id, _tx_type, _amount,
-- _reference_type, _reference_id, _notes_en, _notes_ar, _branch_id) never
-- verified that the caller has access to the supplied _branch_id before
-- recording a patient_wallet_transactions row under that branch. _branch_id
-- is client-supplied (the direct application consumer, PatientWalletTab.tsx,
-- passes the browser's currently-selected branch with no server-side
-- validation), and the RPC is SECURITY DEFINER, so the tables' own RLS
-- (patient_wallets / patient_wallet_transactions branch_isolation policies)
-- never applies to this function's internal writes.
--
-- Exhaustive consumer sweep (Phase J-04.2) confirmed exactly four internal
-- callers, all database triggers, all passing an event-derived branch id
-- (the branch of the invoice or payment that caused the wallet movement):
--   tg_invoice_after_cancel_reversal, tg_invoice_after_referral_reward,
--   tg_payment_after_insert_wallet, tg_payment_after_soft_delete_wallet.
-- In every case that branch is one the acting session already legitimately
-- wrote to under that table's own branch-isolation RLS, so a guard requiring
-- the caller to have access to _branch_id does not break any of them.
--
-- The sweep also confirmed patient_wallets is NOT branch-partitioned (no
-- branch_id column at all -- a patient's wallet balance is a single global
-- figure), and that tg_invoice_after_referral_reward legitimately credits a
-- *different* patient (the referrer) stamped with the *paying* invoice's
-- branch -- i.e. the wallet transaction's branch is deliberately an event
-- attribution, not required to equal the affected patient's own branch_id.
-- Therefore the fix must NOT compare _branch_id against patients.branch_id,
-- and must NOT touch _patient_id's authorization at all -- only whether the
-- caller has access to the branch being recorded.
--
-- Approved remediation (Option A): add exactly one guard clause, immediately
-- after the existing has_permission() authorization check and before the
-- existing business-logic validation, requiring
-- public.user_has_branch_access(_branch_id) whenever _branch_id is supplied.
-- Every other statement in the function is reproduced byte-for-byte
-- unchanged. Signature, defaults, SECURITY DEFINER, owner, language,
-- volatility, and search_path are all unchanged (verified before/after:
-- OID 33304 unchanged, owner postgres, prosecdef=true, language plpgsql,
-- volatility VOLATILE, search_path=public).
--
-- Not touched by this migration: has_role(), user_has_branch_access(),
-- user_has_branch_access_via_patient(), any user_has_branch_access_via_*
-- function (J-14), any RLS policy, any trigger, any application code, any
-- grant, role_permissions/authz_*, or any previously completed
-- J-01/J-03/J-06..J-15/E-01/H-01/H1-01/H1-01-S/retired-staff-role work.

CREATE OR REPLACE FUNCTION public.apply_wallet_tx(_patient_id uuid, _tx_type wallet_tx_type, _amount numeric, _reference_type text, _reference_id uuid, _notes_en text, _notes_ar text, _branch_id uuid DEFAULT NULL::uuid)
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

  -- 3. J-04: caller must have access to the branch being recorded on this
  --    transaction (event-branch attribution, not the patient's own
  --    branch -- patient_wallets is not branch-partitioned, and existing
  --    triggers legitimately stamp event-derived branches that may differ
  --    from the affected patient's branch).
  IF _branch_id IS NOT NULL AND NOT public.user_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to branch %', _branch_id
      USING ERRCODE = '42501';
  END IF;

  -- 4. Business logic — unchanged from prior implementation.
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
