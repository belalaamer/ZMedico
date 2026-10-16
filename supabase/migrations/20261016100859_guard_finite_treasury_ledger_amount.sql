-- ZMED-255: one-function finite-money guard; no historical balance correction.
-- Apply individually after explicit approval; preserve existing business checks.
set local lock_timeout = '2s';
set local statement_timeout = '30s';
do $preflight$
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.add_treasury_tx(uuid,public.treasury_tx_type,numeric,text,uuid,text,text,uuid,boolean)'::regprocedure
  )) is distinct from 'd098b056599914b6cea2adadec524bed' then
    raise exception 'Treasury ledger writer changed; review before applying';
  end if;
end;
$preflight$;

CREATE OR REPLACE FUNCTION public.add_treasury_tx(_treasury_id uuid, _type treasury_tx_type, _amount numeric, _ref_type text, _ref_id uuid, _desc_en text, _desc_ar text, _by uuid, _is_cash boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur numeric(14,2);
  new_balance numeric(14,2);
  delta numeric(14,2);
  new_id uuid;
  v_actor uuid := auth.uid();
  v_treasury_branch uuid;
  v_source_branch uuid;
  v_source_treasury uuid;
  v_source_amount numeric(14,2);
  v_existing_amount numeric(14,2);
  v_source_payment_method public.payment_method;
  v_source_deleted_at timestamptz;
  v_reversal_original public.treasury_transactions%rowtype;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required';
  END IF;

  -- ZMED-255: PostgreSQL numeric NaN passes ordinary positivity checks.
  IF _amount::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Treasury transaction amount must be finite' USING ERRCODE='22023';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Treasury transaction amount must be greater than zero'
      USING ERRCODE = 'check_violation';
  END IF;


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
    INTO v_treasury_branch
    FROM public.treasury
   WHERE id = _treasury_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF v_treasury_branch IS NULL THEN
    RAISE EXCEPTION 'Treasury % not found', _treasury_id;
  END IF;

  IF NOT public.user_has_branch_access(v_treasury_branch) THEN
    RAISE EXCEPTION 'Forbidden: no access to treasury branch %', v_treasury_branch;
  END IF;

  -- A payment-derived income must be an exact, one-time consequence of the
  -- existing payment and must land in that payment's own branch/treasury.
  IF _ref_type = 'payment' AND _ref_id IS NOT NULL THEN
    SELECT p.branch_id, p.treasury_id, p.amount, p.payment_method,
           p.deleted_at
      INTO v_source_branch, v_source_treasury, v_source_amount,
           v_source_payment_method, v_source_deleted_at
      FROM public.payments p
     WHERE p.id = _ref_id;

    IF NOT FOUND OR v_source_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Payment reference % not found or deleted', _ref_id;
    END IF;
    IF NOT public.has_permission(v_actor, 'invoices.create') THEN
      RAISE EXCEPTION 'Forbidden: missing permission invoices.create';
    END IF;
    IF v_source_branch IS NULL OR v_source_branch <> v_treasury_branch THEN
      RAISE EXCEPTION 'Payment and treasury branches do not match'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_source_treasury IS NOT NULL AND v_source_treasury <> _treasury_id THEN
      RAISE EXCEPTION 'Payment and treasury references do not match'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF _type <> 'income' OR _amount <> v_source_amount THEN
      RAISE EXCEPTION 'Payment-derived treasury entry must match the payment amount and direction'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.treasury_transactions tt
       WHERE tt.reference_type = 'payment'
         AND tt.reference_id = _ref_id
    ) THEN
      RAISE EXCEPTION 'Payment % already has a treasury entry', _ref_id
        USING ERRCODE = 'unique_violation';
    END IF;
    IF (_is_cash IS TRUE) <> (v_source_payment_method = 'cash'::public.payment_method) THEN
      RAISE EXCEPTION 'Payment cash classification does not match its payment method'
        USING ERRCODE = 'check_violation';
    END IF;

  -- An expense may be split between cash and non-cash buckets. Every split is
  -- still capped by the source expense amount and must stay in its branch.

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

  ELSIF _ref_type = 'expense' AND _ref_id IS NOT NULL THEN
    SELECT e.branch_id, e.amount, e.deleted_at
      INTO v_source_branch, v_source_amount, v_source_deleted_at
      FROM public.expenses e
     WHERE e.id = _ref_id;

    IF NOT FOUND OR v_source_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Expense reference % not found or deleted', _ref_id;
    END IF;
    IF NOT (public.has_role(v_actor, 'admin'::public.app_role)
            OR public.has_role(v_actor, 'accountant'::public.app_role)) THEN
      RAISE EXCEPTION 'Forbidden: only admin or accountant may post expense-derived entries';
    END IF;
    IF v_source_branch IS NULL OR v_source_branch <> v_treasury_branch THEN
      RAISE EXCEPTION 'Expense and treasury branches do not match'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF _type <> 'expense' THEN
      RAISE EXCEPTION 'Expense-derived treasury entry must be an expense'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT coalesce(sum(tt.amount), 0)
      INTO v_existing_amount
      FROM public.treasury_transactions tt
     WHERE tt.reference_type = 'expense'
       AND tt.reference_id = _ref_id;

    IF v_existing_amount + _amount > v_source_amount THEN
      RAISE EXCEPTION 'Expense-derived treasury entries exceed the expense amount'
        USING ERRCODE = 'check_violation';
    END IF;

  -- Invoice references are not used by the current trigger graph. Do not treat
  -- mere invoice existence as authorization for a balance movement.
  ELSE
    IF NOT public.has_permission(v_actor, 'treasury.tx.write') THEN
      RAISE EXCEPTION 'Forbidden: missing permission treasury.tx.write';
    END IF;
  END IF;

  PERFORM set_config('app.allow_treasury_balance_update', 'on', true);

  IF _is_cash THEN
    SELECT current_balance
      INTO cur
      FROM public.treasury
     WHERE id = _treasury_id
     FOR UPDATE;
  ELSE
    SELECT non_cash_balance
      INTO cur
      FROM public.treasury
     WHERE id = _treasury_id
     FOR UPDATE;
  END IF;
  IF cur IS NULL THEN
    RAISE EXCEPTION 'Treasury % not found', _treasury_id;
  END IF;

  delta := CASE WHEN _type = 'income' THEN _amount ELSE -_amount END;
  new_balance := cur + delta;

  INSERT INTO public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar,
    created_by, is_cash
  )
  VALUES (
    _treasury_id, _type, _amount, new_balance,
    _ref_type, _ref_id, _desc_en, _desc_ar,
    v_actor, _is_cash
  )
  RETURNING id INTO new_id;

  IF _is_cash THEN
    UPDATE public.treasury
       SET current_balance = new_balance, updated_at = now()
     WHERE id = _treasury_id;
  ELSE
    UPDATE public.treasury
       SET non_cash_balance = new_balance, updated_at = now()
     WHERE id = _treasury_id;
  END IF;

  RETURN new_id;
END;
$function$;
