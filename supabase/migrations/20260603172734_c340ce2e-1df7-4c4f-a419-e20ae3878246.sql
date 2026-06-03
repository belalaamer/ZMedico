CREATE OR REPLACE FUNCTION public.tg_invoice_renumber_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.renumber_active_invoices();

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_renumber_after_insert ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_renumber_after_delete ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_renumber_after_update ON public.invoices;

CREATE TRIGGER trg_invoice_renumber_after_insert
AFTER INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.tg_invoice_renumber_after_change();

CREATE TRIGGER trg_invoice_renumber_after_delete
AFTER DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.tg_invoice_renumber_after_change();

CREATE TRIGGER trg_invoice_renumber_after_update
AFTER UPDATE OF deleted_at, invoice_date ON public.invoices
FOR EACH ROW
WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date)
EXECUTE FUNCTION public.tg_invoice_renumber_after_change();

SELECT public.renumber_active_invoices();