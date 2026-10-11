-- ZMED-193 proposal: separate approval required. No financial history repair.
-- Existing payment soft-delete triggers own wallet and treasury reversals.
do $guard$
declare
 v_original text;
 v_start integer;
 v_end integer;
 v_signature text;
 v_expected text;
begin
 for v_signature,v_expected in select * from (values
 ('public.tg_invoice_after_cancel_reversal()','7130197b340b3203f6b2cdffacf97cdb'),
 ('public.tg_payment_after_soft_delete_wallet()','191acfc3fe0f2df28343d0ca1f38b48e'),
 ('public.tg_payment_after_soft_delete()','2a118f92ca33a910fe984695e6779658'),
 ('public.void_invoice_financials(uuid,uuid)','9e86fa1be6e41ec64ad69c673e3ef7fa')
 ) reviewed(signature,fingerprint) loop
  if md5(pg_get_functiondef(v_signature::regprocedure)) is distinct from v_expected then
   raise exception 'Cancellation dependency drift: %; review before applying',v_signature;
  end if;
 end loop;
 if (select count(*) from pg_trigger where not tgisinternal and tgenabled='O'
     and (tgrelid,tgfoid) in (
      ('public.invoices'::regclass,'public.tg_invoice_after_cancel_reversal()'::regprocedure),
      ('public.payments'::regclass,'public.tg_payment_after_soft_delete_wallet()'::regprocedure),
      ('public.payments'::regclass,'public.tg_payment_after_soft_delete()'::regprocedure))) <> 3 then
  raise exception 'Cancellation trigger dependency drift; review before applying';
 end if;
 v_original:=pg_get_functiondef('public.tg_invoice_after_cancel_reversal()'::regprocedure);
 v_start:=strpos(v_original,'    is_wallet_spend :=');
 v_end:=strpos(v_original,'    UPDATE public.payments SET deleted_at');
 if v_start=0 or v_end<=v_start then raise exception 'Cancellation body match failed'; end if;
 -- Keep signature, owner, ACL, existing branch/auth enforcement, commission
 -- handling and cancellation lifecycle unchanged; remove double reversals only.
 execute substr(v_original,1,v_start-1)
  ||'    -- Existing payment soft-delete triggers own financial reversals atomically.'||chr(10)
  ||substr(v_original,v_end);
end;
$guard$;
