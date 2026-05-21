
-- Add AFTER INSERT/UPDATE trigger so invoice subtotal recalculates once row is visible
CREATE OR REPLACE FUNCTION public.tg_invoice_item_after_iu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  perform public.recalc_invoice_subtotal(new.invoice_id);
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_invoice_item_ai ON public.invoice_items;
CREATE TRIGGER trg_invoice_item_ai
AFTER INSERT ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_item_after_iu();

DROP TRIGGER IF EXISTS trg_invoice_item_au ON public.invoice_items;
CREATE TRIGGER trg_invoice_item_au
AFTER UPDATE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_item_after_iu();

-- Backfill subtotals/totals for existing invoices
UPDATE public.invoices i
SET subtotal = COALESCE((SELECT SUM(total) FROM public.invoice_items WHERE invoice_id = i.id), 0);
