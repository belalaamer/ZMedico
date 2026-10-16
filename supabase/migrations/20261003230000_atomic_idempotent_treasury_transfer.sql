-- Post both sides of a treasury transfer in one database transaction.
-- The caller supplies a stable UUID so a lost response can be reconciled and
-- safely retried without posting a second transfer.
-- Unpublished ZMED-105 candidate. Apply individually only after approval.
set local lock_timeout = '2s';
set local statement_timeout = '30s';
do $session_preflight$
begin
  if to_regprocedure('public.assert_active_session()') is null then
    raise exception 'Reviewed active-session assertion required';
  end if;
  if md5(pg_get_functiondef('public.assert_active_session()'::regprocedure))
       is distinct from 'cd7553f3ade0585ecbe09631d1140bb2' then
    raise exception 'Active-session assertion changed; review before applying';
  end if;
  if md5(pg_get_functiondef('zmedico_security.session_is_active()'::regprocedure))
       is distinct from '4a77243167edf154de0192c7105f8bde' then
    raise exception 'Live-session guard changed; review before applying';
  end if;
end;
$session_preflight$;

create function public.transfer_treasury_funds(
  p_from_treasury_id uuid,
  p_to_treasury_id uuid,
  p_amount numeric,
  p_reference_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_from record;
  v_to record;
  v_existing_count integer;
  v_debit_id uuid;
  v_credit_id uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  -- This privileged boundary cannot call the invoker assertion (which checks
  -- current_user). Recheck the original API role and live private guard here.
  if current_setting('role', true) <> 'authenticated'
     or not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'Authentication session is no longer active' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception 'Forbidden: authentication required' using errcode = '42501';
  end if;
  if not public.has_permission(v_actor, 'treasury.tx.write') then
    raise exception 'Forbidden: missing permission treasury.tx.write' using errcode = '42501';
  end if;
  if p_from_treasury_id is null or p_to_treasury_id is null
     or p_from_treasury_id = p_to_treasury_id then
    raise exception 'Source and destination treasuries must be different'
      using errcode = '22023';
  end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
     or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Transfer amount must be positive with at most two decimal places'
      using errcode = '22003';
  end if;
  if p_reference_id is null then
    raise exception 'Transfer reference is required' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 200 then
    raise exception 'Transfer note is too long' using errcode = '22001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('treasury-transfer:' || p_reference_id::text, 0)
  );

  -- Opposite-direction transfers acquire treasury locks in the same UUID order.
  perform 1
  from public.treasury t
  where t.id in (p_from_treasury_id, p_to_treasury_id)
    and t.deleted_at is null
  order by t.id
  for update;

  select t.id, t.branch_id, t.name_en, t.name_ar, t.currency, t.current_balance
    into v_from
  from public.treasury t
  where t.id = p_from_treasury_id and t.deleted_at is null;
  select t.id, t.branch_id, t.name_en, t.name_ar, t.currency
    into v_to
  from public.treasury t
  where t.id = p_to_treasury_id and t.deleted_at is null;

  if v_from.id is null or v_to.id is null then
    raise exception 'Source or destination treasury was not found' using errcode = '23503';
  end if;
  if not public.user_has_branch_access(v_from.branch_id)
     or not public.user_has_branch_access(v_to.branch_id) then
    raise exception 'Forbidden: no access to one or more treasury branches'
      using errcode = '42501';
  end if;
  if nullif(btrim(v_from.currency), '') is null
     or nullif(btrim(v_to.currency), '') is null
     or v_from.currency is distinct from v_to.currency then
    raise exception 'Transfers require treasuries with the same known currency'
      using errcode = '22023';
  end if;

  -- Replays must satisfy the same current branch authorization as new writes.
  select count(*)::integer,
         (array_agg(tt.id) filter (
           where tt.treasury_id = p_from_treasury_id
             and tt.transaction_type = 'expense'::public.treasury_tx_type
             and tt.amount = p_amount
         ))[1],
         (array_agg(tt.id) filter (
           where tt.treasury_id = p_to_treasury_id
             and tt.transaction_type = 'income'::public.treasury_tx_type
             and tt.amount = p_amount
         ))[1]
    into v_existing_count, v_debit_id, v_credit_id
  from public.treasury_transactions tt
  where tt.reference_type = 'transfer'
    and tt.reference_id = p_reference_id;

  if v_existing_count > 0 then
    if v_existing_count = 2 and v_debit_id is not null and v_credit_id is not null then
      return jsonb_build_object(
        'reference_id', p_reference_id,
        'debit_id', v_debit_id,
        'credit_id', v_credit_id,
        'idempotent_replay', true
      );
    end if;
    raise exception 'Transfer reference conflicts with an existing ledger entry'
      using errcode = '23505';
  end if;

  -- Treasury business dates currently use UTC in the application daily-close
  -- form. Check both periods for new writes, but not a read-only replay above.
  perform public._treasury_assert_open_period(
    v_from.branch_id, p_from_treasury_id, (now() at time zone 'UTC')::date
  );
  perform public._treasury_assert_open_period(
    v_to.branch_id, p_to_treasury_id, (now() at time zone 'UTC')::date
  );

  -- A cash transfer cannot spend cash that does not exist. Exact replays above
  -- return the committed pair even if its earlier debit reduced this balance.
  if v_from.current_balance is null or v_from.current_balance < p_amount then
    raise exception 'Insufficient available cash for transfer' using errcode = '23514';
  end if;

  v_debit_id := public.add_treasury_tx(
    p_from_treasury_id, 'expense'::public.treasury_tx_type, p_amount,
    'transfer', p_reference_id,
    'Transfer to ' || v_to.name_en || coalesce(' — ' || v_note, ''),
    'تحويل إلى ' || v_to.name_ar || coalesce(' — ' || v_note, ''),
    v_actor, true
  );

  v_credit_id := public.add_treasury_tx(
    p_to_treasury_id, 'income'::public.treasury_tx_type, p_amount,
    'transfer', p_reference_id,
    'Transfer from ' || v_from.name_en || coalesce(' — ' || v_note, ''),
    'تحويل من ' || v_from.name_ar || coalesce(' — ' || v_note, ''),
    v_actor, true
  );

  return jsonb_build_object(
    'reference_id', p_reference_id,
    'debit_id', v_debit_id,
    'credit_id', v_credit_id,
    'idempotent_replay', false
  );
end;
$function$;

revoke all on function public.transfer_treasury_funds(uuid, uuid, numeric, uuid, text)
from public, anon, service_role;
grant execute on function public.transfer_treasury_funds(uuid, uuid, numeric, uuid, text)
to authenticated;
