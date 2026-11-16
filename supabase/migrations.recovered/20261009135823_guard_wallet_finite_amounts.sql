-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261009135823
-- name: guard_wallet_finite_amounts
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- ZMED-192 proposal only. No automatic repair/backfill of financial history.
do $guard$
declare
 v_original text;
 v_guarded text;
begin
 v_original:=pg_get_functiondef('public.apply_wallet_tx(uuid,public.wallet_tx_type,numeric,text,uuid,text,text,uuid)'::regprocedure);
 if md5(v_original) is distinct from '611eb1b11f3f10459245105ff59949d3' then
  raise exception 'Wallet RPC definition drift; review before applying';
 end if;
 if exists(select 1 from public.patient_wallets where balance::text in ('NaN','Infinity','-Infinity'))
 or exists(select 1 from public.patient_wallet_transactions where amount::text in ('NaN','Infinity','-Infinity') or balance_after::text in ('NaN','Infinity','-Infinity')) then
  raise exception 'Existing non-finite wallet data requires financial review; no automatic repair';
 end if;
 -- Preserve the complete reviewed RPC body, signature, defaults, role and ACL.
 v_guarded:=replace(v_original,$old$  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;$old$,$new$  IF _amount IS NULL OR _amount <= 0
     OR _amount::text IN ('NaN','Infinity','-Infinity')
     OR _amount <> round(_amount, 2) THEN
    RAISE EXCEPTION 'amount must be finite, positive and use at most two decimals' USING ERRCODE='22023';
  END IF;$new$);
 if v_guarded=v_original then raise exception 'Wallet amount guard match failed'; end if;
 v_guarded:=replace(v_guarded,$old$  new_bal := cur + (dir * _amount);$old$,$new$  IF cur IS NULL OR cur::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Wallet balance invalid; financial review required' USING ERRCODE='23514';
  END IF;
  new_bal := cur + (dir * _amount);$new$);
 if position('Wallet balance invalid; financial review required' in v_guarded)=0 then
  raise exception 'Wallet balance guard match failed';
 end if;
 execute v_guarded;
end;
$guard$;

-- Protect direct/imported writes independently of the RPC's validation.
alter table public.patient_wallets add constraint patient_wallets_balance_finite
 check(balance::text not in ('NaN','Infinity','-Infinity')) not valid;
alter table public.patient_wallet_transactions add constraint patient_wallet_transactions_amount_finite
 check(amount::text not in ('NaN','Infinity','-Infinity')) not valid;
alter table public.patient_wallet_transactions add constraint patient_wallet_transactions_balance_after_finite
 check(balance_after::text not in ('NaN','Infinity','-Infinity')) not valid;
alter table public.patient_wallets validate constraint patient_wallets_balance_finite;
alter table public.patient_wallet_transactions validate constraint patient_wallet_transactions_amount_finite;
alter table public.patient_wallet_transactions validate constraint patient_wallet_transactions_balance_after_finite;

