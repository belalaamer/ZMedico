-- ZMED-195 proposal only. No generic accountant treasury grant or history repair.
do $guard$
declare v_original text; v_guarded text;
begin
 v_original:=pg_get_functiondef('public.add_treasury_tx(uuid,public.treasury_tx_type,numeric,text,uuid,text,text,uuid,boolean)'::regprocedure);
 if md5(v_original) is distinct from '748773b39eeb01bd196baad3f063216a' then raise exception 'Treasury definition drift; review before applying'; end if;
 v_guarded:=replace(v_original,'  v_source_deleted_at timestamptz;',
  '  v_source_deleted_at timestamptz;'||chr(10)||'  v_reversal_original public.treasury_transactions%rowtype;');
 v_guarded:=replace(v_guarded,'  SELECT branch_id'||chr(10)||'    INTO v_treasury_branch',$prelock$
  -- Match cancellation lock order: payment before treasury, never the reverse.
  IF _ref_type = 'payment_reversal' THEN
    IF _ref_id IS NULL THEN RAISE EXCEPTION 'Payment reversal reference required' USING ERRCODE='22004'; END IF;
    SELECT p.branch_id,p.treasury_id,p.amount,p.payment_method,p.deleted_at
      INTO v_source_branch,v_source_treasury,v_source_amount,v_source_payment_method,v_source_deleted_at
      FROM public.payments p WHERE p.id=_ref_id FOR UPDATE;
    IF NOT FOUND OR v_source_deleted_at IS NULL THEN
      RAISE EXCEPTION 'Payment reversal requires an existing deleted payment' USING ERRCODE='23503';
    END IF;
  END IF;

  SELECT branch_id
    INTO v_treasury_branch$prelock$);
 v_guarded:=replace(v_guarded,'  ELSIF _ref_type = ''expense'' AND _ref_id IS NOT NULL THEN',$reversal$
  ELSIF _ref_type = 'payment_reversal' THEN
    IF NOT (public.has_role(v_actor,'admin'::public.app_role)
      OR public.has_role(v_actor,'accountant'::public.app_role)
      OR public.has_permission(v_actor,'invoices.delete')) THEN
      RAISE EXCEPTION 'Forbidden: payment reversal authorization required' USING ERRCODE='42501';
    END IF;
    IF v_source_branch IS NULL OR v_source_branch IS DISTINCT FROM v_treasury_branch
      OR (v_source_treasury IS NOT NULL AND v_source_treasury IS DISTINCT FROM _treasury_id) THEN
      RAISE EXCEPTION 'Payment reversal treasury/branch mismatch' USING ERRCODE='23503';
    END IF;
    SELECT * INTO v_reversal_original FROM public.treasury_transactions
      WHERE reference_type='payment' AND reference_id=_ref_id AND treasury_id=_treasury_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original payment treasury entry missing' USING ERRCODE='23503'; END IF;
    IF (SELECT count(*) FROM public.treasury_transactions WHERE reference_type='payment' AND reference_id=_ref_id)<>1
      OR v_reversal_original.transaction_type<>'income'::public.treasury_tx_type
      OR _type IS DISTINCT FROM 'expense'::public.treasury_tx_type
      OR _amount::text IN ('NaN','Infinity','-Infinity')
      OR _amount IS DISTINCT FROM v_source_amount
      OR _amount IS DISTINCT FROM v_reversal_original.amount
      OR _is_cash IS DISTINCT FROM v_reversal_original.is_cash
      OR _is_cash IS DISTINCT FROM (v_source_payment_method='cash'::public.payment_method) THEN
      RAISE EXCEPTION 'Payment reversal must exactly match original amount/direction/cash bucket' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM public.treasury_transactions WHERE reference_type='payment_reversal' AND reference_id=_ref_id) THEN
      RAISE EXCEPTION 'Payment already reversed' USING ERRCODE='23505';
    END IF;

  ELSIF _ref_type = 'expense' AND _ref_id IS NOT NULL THEN$reversal$);
 if v_guarded=v_original OR strpos(v_guarded,'v_reversal_original public.treasury_transactions%rowtype;')=0
 or strpos(v_guarded,'Match cancellation lock order')=0 OR strpos(v_guarded,'Payment already reversed')=0 then
  raise exception 'Treasury reversal body match failed';
 end if;
 execute v_guarded;
end;
$guard$;
