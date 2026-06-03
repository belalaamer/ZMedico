
-- Avoid collision with soft-deleted invoices that may still hold counter-derived numbers.
-- Assign a guaranteed-unique placeholder on insert; the AFTER trigger will renumber to the correct sequential value.
CREATE OR REPLACE FUNCTION public.tg_invoice_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := 'TMP-' || replace(gen_random_uuid()::text, '-', '');
  end if;
  new.claim_status := coalesce(new.claim_status, 'none'::public.claim_status);
  new.claim_amount := coalesce(new.claim_amount, 0);
  new.total := coalesce(new.subtotal,0) - coalesce(new.discount,0) + coalesce(new.tax,0);
  return new;
end;
$function$;

-- Also harden renumber: if a soft-deleted invoice holds the target number, rename it BEFORE the active update
-- (already handled in current renumber_active_invoices, but ensure pass 1 also catches soft-deleted using TMP collisions is impossible since TMP- prefix is distinct).

-- Run renumber now to clean any current inconsistency
SELECT public.renumber_active_invoices();
