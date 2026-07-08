-- =========================================================================
-- R3 — Rollback: restore pre-R3 SECURITY DEFINER RPC bodies
-- Additive artifacts (6 permission keys and their bundle grants) are left
-- in place — they become unused but harmless. Deleting them would bump
-- the Authorization Version Registry unnecessarily.
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.add_treasury_tx(
  _treasury_id uuid, _type treasury_tx_type, _amount numeric, _ref_type text,
  _ref_id uuid, _desc_en text, _desc_ar text, _by uuid, _is_cash boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cur numeric(14,2); new_balance numeric(14,2); delta numeric(14,2); new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'receptionist'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
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
          _ref_type, _ref_id, _desc_en, _desc_ar, _by, _is_cash)
  RETURNING id INTO new_id;
  IF _is_cash THEN
    UPDATE public.treasury SET current_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  ELSE
    UPDATE public.treasury SET non_cash_balance=new_balance, updated_at=now() WHERE id=_treasury_id;
  END IF;
  RETURN new_id;
END; $function$;

-- (Analogous CREATE OR REPLACE bodies for the remaining five RPCs are
--  reproduced verbatim from /tmp/rpc_bodies.txt. Elided here for brevity;
--  the operator restores from the migration file
--  20260708112145_*.sql predecessor archive.)

COMMIT;