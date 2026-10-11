-- ZMED-194 proposal. Requires individually reviewed ZMED-193 first.
-- Preserve historical inventory/finance records; no repair/backfill or new grants.
do $guard$
declare
 v_definition text;
 v_source text;
 v_loop text;
 v_start integer;
 v_end integer;
begin
 v_definition:=pg_get_functiondef('public.tg_invoice_after_cancel_reversal()'::regprocedure);
 v_source:=pg_get_functiondef('public.void_invoice_financials(uuid,uuid)'::regprocedure);
 if md5(v_definition) is distinct from '5f8a266207049b1b3b1aeb371d1eb5bb' then
  raise exception 'Reviewed ZMED-193 prerequisite missing or changed';
 end if;
 if md5(v_source) is distinct from '9e86fa1be6e41ec64ad69c673e3ef7fa'
 or md5(pg_get_functiondef('public.inventory_tx_core(uuid,uuid,public.inventory_tx_type,numeric,numeric,text,uuid,text,text,date,text,uuid)'::regprocedure))
    is distinct from '9eab0ab0d1df589f7cb65c0b8f883a21' then
  raise exception 'Reviewed cancellation stock dependency drift';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.invoices'::regclass
  and tgname='trg_invoice_after_cancel_reversal' and tgenabled='O'
  and tgfoid='public.tg_invoice_after_cancel_reversal()'::regprocedure) then
  raise exception 'Cancellation trigger drift';
 end if;
 v_start:=strpos(v_source,'  for it in');
 v_end:=strpos(v_source,'  update public.invoices set status=''cancelled''');
 if v_start=0 or v_end<=v_start
 or strpos(v_definition,'  p RECORD;')=0 or strpos(v_definition,'  FOR p IN')=0 then
  raise exception 'Reviewed cancellation stock body match failed';
 end if;
 -- Reuse reviewed consumed-minus-returned algorithm, including consumables.
 -- Failures propagate: stock return and payment reversals stay one transaction.
 v_loop:=substr(v_source,v_start,v_end-v_start);
 v_loop:=replace(replace(replace(replace(v_loop,'_invoice_id','NEW.id'),
  'inv.branch_id','NEW.branch_id'),'inv.invoice_number','NEW.invoice_number'),'v_actor','auth.uid()');
 v_definition:=replace(v_definition,'  p RECORD;','  p RECORD;'||chr(10)||'  it RECORD;');
 v_definition:=replace(v_definition,'  FOR p IN',
  '  -- Return only outstanding invoice stock before payment reversals.'||chr(10)||v_loop||'  FOR p IN');
 execute v_definition;
end;
$guard$;
