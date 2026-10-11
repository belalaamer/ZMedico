-- ZMED-196 proposal only. Preserve192 finite guards, deployed207 direct-call protection,
-- ACL and manual permissions. Exact reviewed pre/post207 variants only.
do $guard$
declare v_original text; v_guarded text;
begin
 v_original:=pg_get_functiondef('public.apply_wallet_tx(uuid,public.wallet_tx_type,numeric,text,uuid,text,text,uuid)'::regprocedure);
 if md5(v_original) not in ('ce34cf6d3df9b58c89694f52509dac6e','58bb8ea81f6754d0e7ea484b386403c4') then raise exception 'Reviewed192 or192+207 wallet prerequisite drift'; end if;
 if md5(pg_get_functiondef('public.tg_payment_after_soft_delete_wallet()'::regprocedure)) is distinct from '191acfc3fe0f2df28343d0ca1f38b48e' then raise exception 'Wallet reversal callback drift'; end if;
 v_guarded:=replace(v_original,'  _required_perm text;',$decl$  _required_perm text;
  v_reversal_payment public.payments%rowtype;
  v_reversal_spend public.patient_wallet_transactions%rowtype;
  v_valid_payment_reversal boolean:=false;$decl$);
 v_guarded:=replace(v_guarded,'  _required_perm := CASE',$reversal$
  -- Payment before wallet: match deletion lock order.
  IF _tx_type='adjustment_credit' AND _reference_type='payment' THEN
    IF NOT(public.has_role(_uid,'admin'::public.app_role) OR public.has_role(_uid,'accountant'::public.app_role) OR public.has_permission(_uid,'invoices.delete'))
       OR _branch_id IS NULL OR NOT public.user_has_branch_access(_branch_id) THEN
      RAISE EXCEPTION 'Forbidden: wallet payment reversal authorization required' USING ERRCODE='42501';
    END IF;
    SELECT * INTO v_reversal_payment FROM public.payments WHERE id=_reference_id AND patient_id=_patient_id AND branch_id=_branch_id FOR UPDATE;
    IF NOT FOUND OR v_reversal_payment.deleted_at IS NULL OR v_reversal_payment.is_wallet_topup
      OR v_reversal_payment.payment_method<>'wallet'::public.payment_method
      OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=v_reversal_payment.invoice_id AND patient_id=_patient_id AND branch_id=_branch_id) THEN
      RAISE EXCEPTION 'Wallet reversal requires an exact deleted invoice wallet payment' USING ERRCODE='23503';
    END IF;
    SELECT * INTO v_reversal_spend FROM public.patient_wallet_transactions WHERE reference_type='payment' AND reference_id=_reference_id AND tx_type='spend'::public.wallet_tx_type;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original wallet spend missing' USING ERRCODE='23503'; END IF;
    IF (SELECT count(*) FROM public.patient_wallet_transactions WHERE reference_type='payment' AND reference_id=_reference_id AND tx_type='spend'::public.wallet_tx_type)<>1
      OR v_reversal_spend.patient_id IS DISTINCT FROM _patient_id OR v_reversal_spend.branch_id IS DISTINCT FROM _branch_id
      OR v_reversal_spend.direction<>-1 OR v_reversal_spend.amount IS DISTINCT FROM v_reversal_payment.amount OR _amount IS DISTINCT FROM v_reversal_payment.amount THEN
      RAISE EXCEPTION 'Wallet reversal must match original payment and spend' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM public.patient_wallet_transactions WHERE reference_type='payment' AND reference_id=_reference_id AND tx_type='adjustment_credit'::public.wallet_tx_type) THEN
      RAISE EXCEPTION 'Wallet payment already reversed' USING ERRCODE='23505';
    END IF;
    v_valid_payment_reversal:=true;
  END IF;
  _required_perm := CASE$reversal$);
 v_guarded:=replace(v_guarded,'IF NOT public.has_permission(_uid, _required_perm) THEN','IF NOT v_valid_payment_reversal AND NOT public.has_permission(_uid, _required_perm) THEN');
 if v_guarded=v_original OR strpos(v_guarded,'v_valid_payment_reversal boolean:=false;')=0
  OR strpos(v_guarded,'IF NOT v_valid_payment_reversal AND NOT')=0 OR strpos(v_guarded,'Wallet payment already reversed')=0 then raise exception 'Wallet reversal body match failed'; end if;
 if md5(v_original)='58bb8ea81f6754d0e7ea484b386403c4' and strpos(v_guarded,'pg_catalog.pg_trigger_depth() = 0 AND NOT (')=0 then raise exception 'Deployed207 direct-call guard must remain'; end if;
 execute v_guarded;
end;
$guard$;
