CREATE OR REPLACE FUNCTION public.tg_invoice_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := public.generate_invoice_number();
  end if;
  new.claim_status := coalesce(new.claim_status, 'none'::public.claim_status);
  new.claim_amount := coalesce(new.claim_amount, 0);
  new.total := coalesce(new.subtotal,0) - coalesce(new.discount,0) + coalesce(new.tax,0);
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.tg_invoice_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.claim_status := coalesce(new.claim_status, 'none'::public.claim_status);
  new.claim_amount := coalesce(new.claim_amount, 0);
  new.total := coalesce(new.subtotal,0) - coalesce(new.discount,0) + coalesce(new.tax,0);
  return new;
end; $function$;