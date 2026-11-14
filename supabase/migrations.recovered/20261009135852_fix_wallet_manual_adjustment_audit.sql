-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261009135852
-- name: fix_wallet_manual_adjustment_audit
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- ZMED-191 proposal: do not deploy without individual review/approval.
-- No backfill or reconstructed audit history. Preserve existing role/ACL/RLS.
do $preflight$
begin
 if md5(pg_get_functiondef('public.tg_audit_wallet_tx()'::regprocedure))
    is distinct from 'cd16d438086fcd5d45a8acbad153893e' then
  raise exception 'Wallet audit definition drift; review before applying';
 end if;
 if not exists(select 1 from pg_trigger
  where tgrelid='public.patient_wallet_transactions'::regclass
   and tgname='audit_wallet_tx_v2' and tgenabled='O'
   and tgfoid='public.tg_audit_wallet_tx()'::regprocedure) then
  raise exception 'Wallet audit trigger changed; review before applying';
 end if;
end;
$preflight$;

create or replace function public.tg_audit_wallet_tx()
returns trigger language plpgsql security definer set search_path=public as $function$
begin
 if TG_OP='INSERT' and NEW.tx_type in (
  'adjustment_credit'::public.wallet_tx_type,
  'adjustment_debit'::public.wallet_tx_type
 ) then
  -- Always audit adjustments: a caller-controlled reference cannot suppress it.
  -- Automatic reversal callers also use these enum values, not a manual UI action.
  perform public._audit_write('wallet_transaction',NEW.id,
   case when NEW.reference_type='manual_adjustment' then 'manual_adjustment' else 'wallet_adjustment' end,
   null,
   jsonb_build_object('patient_id',NEW.patient_id,'tx_type',NEW.tx_type::text,'direction',NEW.direction,
    'amount',NEW.amount,'balance_after',NEW.balance_after,
    'reference_type',NEW.reference_type,'reference_id',NEW.reference_id,
    'created_by',NEW.created_by),NEW.branch_id,NEW.created_by);
 end if;
 return NEW;
end;
$function$;

