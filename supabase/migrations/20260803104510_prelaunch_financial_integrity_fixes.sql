-- Pre-launch QA remediation: financial integrity.
-- Every defect below was reproduced live in a rolled-back transaction.
-- Verified beforehand: zero existing rows violate any constraint added here.
--
-- Applied live 2026-08-03 as migration 20260803104510.

-- =====================================================================
-- 1. CRITICAL: voiding a paid invoice crashed.
-- void_invoice_financials() set payments.updated_at, but that column does not
-- exist on public.payments. Every void/refund raised:
--   column "updated_at" of relation "payments" does not exist
-- Only that assignment is removed. Treasury reversal is unaffected: it happens
-- via the payment soft-delete trigger (verified live -- voiding a 1,600 EGP
-- invoice moved non-cash balance 11,850 -> 10,250 and wrote 2 reversal rows).
-- =====================================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'void_invoice_financials'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'void_invoice_financials not found';
  END IF;

  v_def := replace(v_def, 'deleted_at = now(), updated_at = now()', 'deleted_at = now()');
  v_def := regexp_replace(v_def, ',\s*updated_at\s*=\s*now\(\)', '', 'g');

  IF v_def ILIKE '%updated_at%' THEN
    RAISE EXCEPTION 'Could not strip updated_at from void_invoice_financials; aborting rather than guessing';
  END IF;

  EXECUTE v_def;
END $$;

-- =====================================================================
-- 2. CRITICAL: money could be posted against a CANCELLED invoice, and an
--    invoice could be overpaid without limit (live test booked 101,099 EGP
--    against a 4,100 EGP invoice and the treasury accepted all of it).
--    Wallet top-ups and standalone payments (invoice_id IS NULL) are exempt.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_payment_before_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_total  numeric;
  v_paid   numeric;
BEGIN
  IF NEW.invoice_id IS NULL OR COALESCE(NEW.is_wallet_topup, false) THEN
    RETURN NEW;
  END IF;

  SELECT i.status::text, i.total, COALESCE(i.paid_amount, 0)
    INTO v_status, v_total, v_paid
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot record a payment against a cancelled invoice'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_total IS NOT NULL AND (v_paid + NEW.amount) > v_total THEN
    RAISE EXCEPTION 'Overpayment blocked: invoice total %, already paid %, this payment % exceeds the balance due',
      v_total, v_paid, NEW.amount
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_before_insert_guard ON public.payments;
CREATE TRIGGER trg_payment_before_insert_guard
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_before_insert_guard();

-- =====================================================================
-- 3. HIGH: a mistyped discount produced a negative invoice total
--    (live test produced total = -9,499 EGP).
-- =====================================================================
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_total_non_negative CHECK (total >= 0);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_discount_within_bounds CHECK (discount <= subtotal + tax);

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_quantity_positive CHECK (quantity > 0);

-- =====================================================================
-- 4. HIGH: payments.pay_update_own_or_admin had USING but no WITH CHECK, so
--    whoever took a payment could afterwards rewrite its amount, method,
--    branch, or reassign received_by to someone else.
-- =====================================================================
ALTER POLICY pay_update_own_or_admin ON public.payments
  WITH CHECK (
    (received_by = auth.uid() AND user_has_branch_access(branch_id))
    OR (has_role(auth.uid(), 'admin'::app_role) AND user_has_branch_access(branch_id))
  );
