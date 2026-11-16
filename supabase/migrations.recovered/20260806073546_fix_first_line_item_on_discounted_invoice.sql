-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260806073546
-- name: fix_first_line_item_on_discounted_invoice
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- PROVEN by walking a real clinic day through the system: adding the FIRST line
-- item to an invoice that already carries a discount was impossible.
--
--   invoice: subtotal 500, discount 50, tax 0, total 450   -> created fine
--   first line item                                        -> 23514 check violation
--
-- Cause: tg_invoice_item_aiud() runs on trg_invoice_item_bi, which is BEFORE
-- INSERT, and calls recalc_invoice_subtotal(). At that moment the new item is not
-- in the table yet, so the recalculation sees zero items and writes subtotal = 0
-- onto the invoice. CHECK (discount <= subtotal + tax) then fails, because 50 is
-- not <= 0.
--
-- The call is also redundant: trg_invoice_item_ai fires AFTER INSERT and calls
-- recalc_invoice_subtotal() again, correctly, with the row visible. So the BEFORE
-- trigger was doing the same work at the one moment when the answer is guaranteed
-- to be wrong.
--
-- Test matrix that isolated it (all rolled back):
--   item on a 0-discount invoice ............ passed
--   FIRST item on a discounted invoice ...... failed 23514   <- the bug
--   items first, discount applied after ..... passed
--   SECOND item on a discounted invoice ..... passed
-- Only the first-item-plus-existing-discount combination breaks, which is exactly
-- why it survived: it needs a discount to be set before any line exists.
--
-- Fix: the BEFORE trigger keeps its one legitimate job -- deriving the line total
-- from quantity x unit price -- and no longer recalculates the parent. The DELETE
-- path still recalculates, because trg_invoice_item_ad fires AFTER DELETE and this
-- same function is what does that work.

CREATE OR REPLACE FUNCTION public.tg_invoice_item_aiud()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Reached from trg_invoice_item_ad (AFTER DELETE): the row is already gone,
    -- so recalculating here is correct.
    PERFORM public.recalc_invoice_subtotal(OLD.invoice_id);
    RETURN OLD;
  END IF;

  -- Reached from trg_invoice_item_bi / _bu (BEFORE INSERT/UPDATE). Derive the
  -- line total only. Do NOT recalculate the parent invoice here: on INSERT the
  -- new row is not visible yet, so the sum would come back short -- zero for the
  -- first line -- and any discount already on the invoice would then violate
  -- CHECK (discount <= subtotal + tax). The AFTER trigger does it properly.
  NEW.total := COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0);
  RETURN NEW;
END;
$fn$;
