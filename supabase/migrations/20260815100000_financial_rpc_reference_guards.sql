-- Harden the client-callable treasury RPC without changing the intended role model.
--
-- The previous reception-payment fix correctly allowed a payment trigger to post
-- its derived ledger row without treasury.tx.write. However, it only checked that
-- a referenced payment/expense/invoice existed. A signed-in caller could therefore
-- reuse an existing payment id with a different amount, type, or treasury and
-- manufacture an arbitrary balance movement.
--
-- This migration keeps the two intended paths distinct:
--   1. Derived payment/expense rows are accepted only when their amount, branch,
--      treasury, direction, and duplicate rules match the source record.
--   2. Manual adjustments, transfers, and reversals still require the explicit
--      treasury.tx.write permission and branch access.
--
-- The client-supplied _by value remains audit metadata only; auth.uid() is used.

CREATE OR REPLACE FUNCTION public.add_treasury_tx(
  _treasury_id uuid,
  _type treasury_tx_type,
  _amount numeric,
  _ref_type text,
  _ref_id uuid,
  _desc_en text,
  _desc_ar text,
  _by uuid,
  _is_cash boolean DEFAULT true
)
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Treasury transaction amount must be greater than zero'
      USING ERRCODE = 'check_violation';
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

-- Trigger-only helpers are not public RPC endpoints. Keep them callable by
-- their owning trigger functions, but remove direct anon/authenticated access.
REVOKE EXECUTE ON FUNCTION public.tg_payment_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_expense_after_insert() FROM PUBLIC, anon, authenticated;

-- These manager write policies contradict the authoritative matrix: manager has
-- finance view/export only. Drop the permissive policies so UI hiding is backed
-- by database enforcement as well.
DROP POLICY IF EXISTS manager_invoices_update ON public.invoices;
DROP POLICY IF EXISTS manager_invoice_items_insert ON public.invoice_items;
DROP POLICY IF EXISTS manager_invoice_items_update ON public.invoice_items;
DROP POLICY IF EXISTS manager_payments_insert ON public.payments;
DROP POLICY IF EXISTS manager_payments_update ON public.payments;
DROP POLICY IF EXISTS manager_expenses_insert ON public.expenses;
DROP POLICY IF EXISTS manager_expenses_update ON public.expenses;
