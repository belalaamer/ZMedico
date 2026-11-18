-- PR-6 compatibility: the reviewed path for archiving a treasury row.
--
-- 20261117125000_treasury_metadata_privileges.sql deliberately removed the
-- direct authenticated UPDATE grant on public.treasury, including deleted_at.
-- The existing Treasury screen used to soft-delete with a direct table update,
-- so that screen would otherwise fail with 42501 after the privilege migration.
--
-- This migration adds the narrow SECURITY DEFINER path the screen needs. It
-- does not restore table-level UPDATE, does not delete a row, and does not
-- touch balances or the ledger. It sets deleted_at only; the row and its
-- history remain. The existing treasury.delete permission and branch scope are
-- enforced by the same authorization helper the other treasury RPCs use.
--
-- The existing UI guard rejects a treasury with any treasury_transactions row.
-- The RPC repeats that check under the row lock and also rejects an unsettled
-- shift, so a concurrent payment cannot slip between the screen's check and
-- the archive, and an active drawer cannot be archived out from under a shift.
--
-- Forward-only rollback: ship a reviewed replacement RPC; do not restore direct
-- UPDATE on deleted_at or table-level UPDATE on public.treasury.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.fn_treasury_archive(_treasury_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_branch uuid;
  v_id uuid;
begin
  v_branch := public._treasury_shift_authorize_treasury(
    _treasury_id, 'treasury.delete'
  );

  -- Lock the row first, then re-check the children. The same lock order as the
  -- treasury write paths keeps this from racing a payment or a shift close.
  perform 1
    from public.treasury t
   where t.id = _treasury_id
     and t.branch_id = v_branch
     and t.deleted_at is null
     for update;
  if not found then
    raise exception 'Treasury not found or already archived'
      using errcode = '23503';
  end if;

  if exists (
    select 1 from public.treasury_transactions tx
     where tx.treasury_id = _treasury_id
  ) then
    raise exception 'Treasury has transactions and cannot be archived'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.treasury_shifts s
     where s.treasury_id = _treasury_id
       and s.closed_at is null
  ) then
    raise exception 'Treasury has an open shift and cannot be archived'
      using errcode = '23514';
  end if;

  update public.treasury
     set deleted_at = statement_timestamp()
   where id = _treasury_id
     and branch_id = v_branch
     and deleted_at is null
   returning id into v_id;

  if v_id is null then
    raise exception 'Treasury not found or already archived'
      using errcode = '23503';
  end if;

  return v_id;
end;
$function$;

revoke all on function public.fn_treasury_archive(uuid) from public, anon;
grant execute on function public.fn_treasury_archive(uuid)
  to authenticated, service_role;
