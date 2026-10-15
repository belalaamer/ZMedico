-- ZMED-147/210 reviewed, single-function release. No data/history/RLS changes.
-- Abort instead of replacing any unreviewed Production definition.
set local lock_timeout = '3s';
set local statement_timeout = '20s';
do $preflight$
declare item record;
begin
  for item in select * from (values
    ('public.tg_payment_before_insert_guard()', 'e07fa070143bcc2136430ee8222c06c4'),
    ('public.add_treasury_tx(uuid,public.treasury_tx_type,numeric,text,uuid,text,text,uuid,boolean)', 'd098b056599914b6cea2adadec524bed'),
    ('public.apply_wallet_tx(uuid,public.wallet_tx_type,numeric,text,uuid,text,text,uuid)', '98a89e37f2671deb206feba371ef80e6'),
    ('public.default_treasury_for_branch(uuid)', 'ef61ca409a3e40864952699b419ae326'),
    ('public.tg_invoice_after_cancel_reversal()', 'aa20c5568127ff78263dda25cf3c940c'),
    ('public.tg_invoice_amount_locked_when_paid()', 'e9de348db814f7b2f6276f6819e6a9da'),
    ('public.tg_payment_after_soft_delete()', '2a118f92ca33a910fe984695e6779658'),
    ('public.tg_payment_after_soft_delete_wallet()', '191acfc3fe0f2df28343d0ca1f38b48e')
  ) as expected(signature, fingerprint)
  loop
    if to_regprocedure(item.signature) is null
       or md5(pg_get_functiondef(to_regprocedure(item.signature))) is distinct from item.fingerprint then
      raise exception 'Reviewed payment dependency drift: %', item.signature;
    end if;
  end loop;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.payments'::regclass
      and tgname='trg_payment_before_insert_guard'
      and tgfoid='public.tg_payment_before_insert_guard()'::regprocedure
      and tgenabled='O' and tgtype=7 and not tgisinternal
  ) then raise exception 'Reviewed BEFORE INSERT payment trigger missing or changed'; end if;
  if exists (
    select 1 from pg_class where oid in ('public.payments'::regclass,'public.invoices'::regclass)
      and not relrowsecurity
  ) then raise exception 'Financial RLS must remain enabled'; end if;
  if not exists (
    select 1 from pg_index i
    join pg_attribute a on a.attrelid=i.indrelid and a.attname='invoice_id'
    where i.indrelid='public.payments'::regclass and i.indisvalid and i.indisready
      and i.indpred is null and i.indkey[0]=a.attnum
  ) then raise exception 'Reviewed invoice payment lookup index missing'; end if;
  if has_function_privilege('anon','public.tg_payment_before_insert_guard()','execute')
     or has_function_privilege('authenticated','public.tg_payment_before_insert_guard()','execute') then
    raise exception 'Internal payment guard must not be a directly executable user RPC';
  end if;
end;
$preflight$;

-- Serialize invoice-linked payment validation on the invoice row. Without the
-- row lock, concurrent inserts can both observe the same paid_amount and both
-- pass the overpayment guard. Also enforce the patient/branch relationship at
-- the database boundary instead of relying on the payment dialog lookup.

create or replace function public.tg_payment_before_insert_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_total numeric;
  v_paid numeric;
  v_patient_id uuid;
  v_branch_id uuid;
begin
  if new.invoice_id is not null and coalesce(new.is_wallet_topup, false) then
    raise exception 'Wallet top-up cannot reference an invoice' using errcode = '23514';
  end if;
  if new.invoice_id is null then
    return new;
  end if;

  select i.status::text,
         i.total,
         i.patient_id,
         i.branch_id
    into v_status, v_total, v_patient_id, v_branch_id
  from public.invoices i
  where i.id = new.invoice_id
    and i.deleted_at is null
  for update;

  if not found then
    raise exception 'Invoice not found or deleted' using errcode = '23503';
  end if;
  if new.patient_id is distinct from v_patient_id
     or new.branch_id is distinct from v_branch_id then
    raise exception 'Payment patient and branch must match the invoice'
      using errcode = '23503';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Cannot record a payment against a cancelled invoice'
      using errcode = '23514';
  end if;
  -- Bulk INSERT guards run before the AFTER-row invoice rollup. Count actual
  -- active payments under the invoice lock, including earlier batch rows.
  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  where p.invoice_id = new.invoice_id and p.deleted_at is null;
  if v_total is not null and (v_paid + new.amount) > v_total then
    raise exception 'Overpayment blocked: invoice total %, already paid %, this payment % exceeds the balance due',
      v_total, v_paid, new.amount
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.tg_payment_before_insert_guard()
from public, anon, authenticated;
grant execute on function public.tg_payment_before_insert_guard()
to service_role;
