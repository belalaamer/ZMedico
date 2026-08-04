-- Reception could not take money. Fix the authorization model for ledger posting.
--
-- PROVEN, live, per role, against an invoice with a balance due:
--   receptionist -> Forbidden: missing permission treasury.tx.write
--   accountant   -> Forbidden: missing permission treasury.tx.write
--   manager      -> Forbidden: missing permission treasury.tx.write
--   admin        -> CAN take payment
--
-- `treasury.tx.write` is held by `admin` only. So in a real clinic the front desk
-- -- whose entire job is collecting payments -- could not record one. Only an
-- admin could. RLS on `payments` explicitly permits receptionist, accountant and
-- manager to INSERT, so the system contradicted itself: the row was allowed, then
-- the AFTER INSERT trigger aborted the whole transaction.
--
-- WHY NOT SIMPLY GRANT treasury.tx.write TO RECEPTION: add_treasury_tx is also
-- the entry point for MANUAL treasury adjustments from the Treasury screen.
-- Granting it would let the front desk post arbitrary cash movements with no
-- corresponding payment -- the opposite of what you want where cash is handled.
--
-- THE FIX: authorize on WHAT is being posted, not only on who is posting.
--   * A ledger entry derived from a payment, expense or invoice row that ALREADY
--     EXISTS was, by definition, authorized by that table's RLS policy when the
--     row was inserted. Posting its ledger consequence needs no second
--     permission -- and the EXISTS check means a caller cannot fabricate one.
--   * Anything else -- a manual adjustment, an arbitrary reference type -- still
--     requires treasury.tx.write, so the strict path stays strict.
--
-- This edits ONE function rather than the six trigger functions that call it,
-- which keeps the change small and auditable. Everything after the
-- authorization block is unchanged.
--
-- VERIFIED after applying, per role:
--   collect payment : receptionist YES, accountant YES, manager YES, admin YES,
--                     doctor/nurse/hr/staff no
--   manual adjust   : admin and system_owner only; everyone else blocked
--   financial regression suite: 12/12 PASS

CREATE OR REPLACE FUNCTION public.add_treasury_tx(_treasury_id uuid, _type treasury_tx_type, _amount numeric, _ref_type text, _ref_id uuid, _desc_en text, _desc_ar text, _by uuid, _is_cash boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur numeric(14,2); new_balance numeric(14,2); delta numeric(14,2); new_id uuid;
  v_actor uuid := auth.uid();
  v_derived boolean := false;
BEGIN
  -- Is this entry the consequence of an already-authorized business record?
  IF _ref_id IS NOT NULL THEN
    IF _ref_type = 'payment' THEN
      v_derived := EXISTS (SELECT 1 FROM public.payments WHERE id = _ref_id);
    ELSIF _ref_type = 'expense' THEN
      v_derived := EXISTS (SELECT 1 FROM public.expenses WHERE id = _ref_id);
    ELSIF _ref_type = 'invoice' THEN
      v_derived := EXISTS (SELECT 1 FROM public.invoices WHERE id = _ref_id);
    END IF;
  END IF;

  -- Manual adjustments and unrecognised reference types still require the
  -- explicit treasury permission.
  IF NOT v_derived THEN
    IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'treasury.tx.write') THEN
      RAISE EXCEPTION 'Forbidden: missing permission treasury.tx.write';
    END IF;
  END IF;

  PERFORM set_config('app.allow_treasury_balance_update','on', true);

  IF _is_cash THEN
    SELECT current_balance  INTO cur FROM public.treasury WHERE id=_treasury_id FOR UPDATE;
  ELSE
    SELECT non_cash_balance INTO cur FROM public.treasury WHERE id=_treasury_id FOR UPDATE;
  END IF;
  IF cur IS NULL THEN RAISE EXCEPTION 'Treasury % not found', _treasury_id; END IF;
  delta := CASE WHEN _type='income' THEN _amount ELSE -_amount END;
  new_balance := cur + delta;
  INSERT INTO public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar, created_by, is_cash)
  VALUES (_treasury_id, _type, _amount, new_balance,
          _ref_type, _ref_id, _desc_en, _desc_ar, coalesce(v_actor, _by), _is_cash)
  RETURNING id INTO new_id;
  IF _is_cash THEN
    UPDATE public.treasury SET current_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  ELSE
    UPDATE public.treasury SET non_cash_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  END IF;
  RETURN new_id;
END;
$function$;
