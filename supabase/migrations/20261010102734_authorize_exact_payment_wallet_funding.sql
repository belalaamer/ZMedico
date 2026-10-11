-- ZMED-200 candidate: individually review before Production deployment.
-- Preserves192 finite guards, optional196 reversal guards, deployed207 protection
-- and existing ACL/RLS. Only exact reviewed body variants are accepted.
-- No balance repair, financial DML, service-key call or permission-table change.
DO $funding$
DECLARE
  routine oid := 'public.apply_wallet_tx(uuid,public.wallet_tx_type,numeric,text,uuid,text,text,uuid)'::regprocedure;
  original text;
  guarded text;
  old_gate text;
  new_gate text;
  original_acl aclitem[];
  original_owner oid;
  original_definer boolean;
  original_config text[];
BEGIN
  SELECT pg_get_functiondef(p.oid), p.proacl, p.proowner, p.prosecdef, p.proconfig
    INTO original, original_acl, original_owner, original_definer, original_config
    FROM pg_proc p WHERE p.oid = routine;
  IF md5(original) NOT IN ('ce34cf6d3df9b58c89694f52509dac6e', 'c432fe02b9a614fdf63da8725a4fa466',
      '58bb8ea81f6754d0e7ea484b386403c4', '6c9ea7799a6ddaaf2c4642ed132a05e0') THEN
    RAISE EXCEPTION 'Reviewed192 with optional196/207 wallet prerequisite drift; review before applying';
  END IF;
  IF md5(pg_get_functiondef('public.tg_payment_after_insert_wallet()'::regprocedure))
     IS DISTINCT FROM '51bdd17edeef8c9d3082951bb3ecbb3c' THEN
    RAISE EXCEPTION 'Payment wallet callback drift; review before applying';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE convalidated AND conname IN ('patient_wallets_balance_finite',
        'patient_wallet_transactions_amount_finite', 'patient_wallet_transactions_balance_after_finite')
        AND conrelid IN ('public.patient_wallets'::regclass, 'public.patient_wallet_transactions'::regclass)) <> 3 THEN
    RAISE EXCEPTION 'Reviewed validated192 finite constraints required';
  END IF;

  old_gate := CASE WHEN md5(original) IN ('ce34cf6d3df9b58c89694f52509dac6e','58bb8ea81f6754d0e7ea484b386403c4')
    THEN 'IF NOT public.has_permission(_uid, _required_perm) THEN'
    ELSE 'IF NOT v_valid_payment_reversal AND NOT public.has_permission(_uid, _required_perm) THEN' END;
  new_gate := CASE WHEN md5(original) IN ('ce34cf6d3df9b58c89694f52509dac6e','58bb8ea81f6754d0e7ea484b386403c4')
    THEN 'IF NOT valid_funding AND NOT public.has_permission(_uid, _required_perm) THEN'
    ELSE 'IF NOT valid_funding AND NOT v_valid_payment_reversal AND NOT public.has_permission(_uid, _required_perm) THEN' END;
  -- Refuse ambiguous/partial edits even if a future reviewed body changes layout.
  IF (length(original) - length(replace(original, '  _required_perm text;', ''))) / length('  _required_perm text;') <> 1
     OR (length(original) - length(replace(original, '  _required_perm := CASE', ''))) / length('  _required_perm := CASE') <> 1
     OR (length(original) - length(replace(original, old_gate, ''))) / length(old_gate) <> 1 THEN
    RAISE EXCEPTION 'Exact wallet funding insertion points changed';
  END IF;
  guarded := replace(original, '  _required_perm text;', $decl$  _required_perm text;
  funding public.payments%rowtype;
  valid_funding boolean := false;$decl$);
  guarded := replace(guarded, '  _required_perm := CASE', $body$
  IF _tx_type = 'topup' AND _reference_type = 'payment' THEN
    IF public.has_permission(_uid, 'invoices.create') IS NOT TRUE
       OR _branch_id IS NULL OR public.user_has_branch_access(_branch_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Payment-backed wallet funding authorization required' USING ERRCODE = '42501';
    END IF;
    -- Payment first, wallet second: retain the existing callback lock order.
    SELECT * INTO funding FROM public.payments WHERE id = _reference_id FOR UPDATE;
    IF NOT FOUND OR funding.deleted_at IS NOT NULL OR funding.is_wallet_topup IS DISTINCT FROM true
       OR funding.invoice_id IS NOT NULL OR funding.patient_id IS DISTINCT FROM _patient_id
       OR funding.branch_id IS DISTINCT FROM _branch_id OR funding.received_by IS DISTINCT FROM _uid
       OR funding.amount IS DISTINCT FROM _amount
       OR (funding.payment_method::text IN ('cash', 'card', 'bank_transfer', 'insurance')) IS NOT TRUE THEN
      RAISE EXCEPTION 'Wallet funding requires an exact active owned top-up payment' USING ERRCODE = '23514';
    END IF;
    IF funding.wallet_credit_tx_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.patient_wallet_transactions
        WHERE reference_type = 'payment' AND reference_id = _reference_id AND tx_type = 'topup'
    ) THEN
      RAISE EXCEPTION 'Payment wallet credit already exists' USING ERRCODE = '23514';
    END IF;
    valid_funding := true;
  END IF;
  _required_perm := CASE$body$);
  guarded := replace(guarded, old_gate, new_gate);
  IF guarded = original OR strpos(guarded, new_gate) = 0
     OR strpos(guarded, 'Wallet balance invalid; financial review required') = 0
     OR strpos(guarded, 'at most two decimals') = 0 THEN
    RAISE EXCEPTION 'Funding patch or finite guards not preserved';
  END IF;
  EXECUTE guarded;
  IF md5(original) IN ('58bb8ea81f6754d0e7ea484b386403c4','6c9ea7799a6ddaaf2c4642ed132a05e0')
     AND strpos(guarded,'pg_catalog.pg_trigger_depth() = 0 AND NOT (') = 0 THEN
    RAISE EXCEPTION 'Deployed207 direct-call protection must remain';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = routine AND
      (p.proacl IS DISTINCT FROM original_acl OR p.proowner IS DISTINCT FROM original_owner
       OR p.prosecdef IS DISTINCT FROM original_definer OR p.proconfig IS DISTINCT FROM original_config)) THEN
    RAISE EXCEPTION 'Wallet metadata drift; migration must preserve ACL/owner/security/search_path';
  END IF;
END;
$funding$;
