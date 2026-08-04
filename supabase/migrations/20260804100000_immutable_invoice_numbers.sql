-- Make invoice numbers IMMUTABLE once issued.
--
-- THE PROBLEM: renumber_active_invoices() re-derived the number of EVERY active
-- invoice on every insert, update and delete of any invoice (triggers
-- trg_invoice_renumber_after_insert / _update / _delete). A patient's invoice
-- number could therefore change after it had been printed and handed over.
--
-- Egyptian tax practice -- like most jurisdictions -- requires that an issued
-- invoice number is permanent and never reassigned. A renumbering scheme also
-- makes it impossible to prove after the fact which document a payment relates
-- to. This is a compliance defect, not a cosmetic one.
--
-- THE FIX: assign the number ONCE, at insert, and refuse to change it after.
--   * tg_invoice_before_insert now calls generate_invoice_number(branch_id)
--     instead of parking a 'TMP-<uuid>' placeholder.
--   * The three renumber triggers are dropped.
--   * A new guard trigger refuses any UPDATE that alters invoice_number once a
--     real number is set. TMP- placeholders left by older rows may still be
--     corrected, so nothing existing gets stuck.
--
-- CONSEQUENCE, AND IT IS THE CORRECT ONE: cancelling an invoice now leaves a
-- permanent gap in the sequence, because the cancelled document keeps its
-- number. That is exactly what an auditor expects -- a missing number is
-- suspicious, a reused one is worse.
--
-- The function renumber_active_invoices() is intentionally NOT dropped. It stays
-- available for a deliberate, manual, one-off repair, but nothing calls it now.
--
-- Verified live in a rolled-back test:
--   two new invoices     -> INV-MAIN-2026-0024 then INV-MAIN-2026-0025
--   oldest existing       -> INV-2026-0001 UNCHANGED (no renumbering)
--   rename attempt        -> refused
--   cancellation          -> number retained

-- 1) Numbers are issued at insert time, once.
CREATE OR REPLACE FUNCTION public.tg_invoice_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF new.invoice_number IS NULL OR new.invoice_number = '' THEN
    IF new.branch_id IS NULL THEN
      -- Numbering is per branch, and invoice_counters is keyed on
      -- (branch_id, year), so a branchless invoice cannot be numbered. Fail
      -- loudly rather than issue an unnumbered or mis-attributed document.
      RAISE EXCEPTION 'Cannot issue an invoice without a branch: invoice numbering is per-branch'
        USING ERRCODE = 'not_null_violation';
    END IF;
    new.invoice_number := public.generate_invoice_number(new.branch_id);
  END IF;

  new.claim_status := coalesce(new.claim_status, 'none'::public.claim_status);
  new.claim_amount := coalesce(new.claim_amount, 0);
  new.total := coalesce(new.subtotal,0) - coalesce(new.discount,0) + coalesce(new.tax,0);
  RETURN new;
END;
$fn$;

-- 2) Stop the automatic renumbering of already-issued invoices.
DROP TRIGGER IF EXISTS trg_invoice_renumber_after_insert ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_renumber_after_update ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_renumber_after_delete ON public.invoices;

-- 3) Refuse to change an issued number.
CREATE OR REPLACE FUNCTION public.tg_invoice_number_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number THEN
    -- Allow only the repair of a legacy placeholder.
    IF OLD.invoice_number IS NULL
       OR OLD.invoice_number = ''
       OR OLD.invoice_number LIKE 'TMP-%' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invoice number % is already issued and cannot be changed (attempted: %). Cancel the invoice and issue a new one instead.',
      OLD.invoice_number, NEW.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_invoice_number_immutable ON public.invoices;
CREATE TRIGGER trg_invoice_number_immutable
  BEFORE UPDATE OF invoice_number ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_number_immutable();
