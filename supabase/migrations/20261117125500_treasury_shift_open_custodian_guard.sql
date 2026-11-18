-- PR-6 closure fix: only the assigned drawer custodian may open a shift.
--
-- Why this is needed
-- ------------------
-- fn_treasury_shift_open() checked branch permission but not custody. A user
-- with treasury.shift.use could open a cash drawer assigned to another
-- custodian. The shift row was written with the caller as opened_by and
-- custodian_user_id (the schema requires those to match), so the later close,
-- settle, and close-and-settle paths rejected it with
-- "Shift custodian does not match the drawer custodian". The open succeeded
-- and left an unsettled shift that its assigned custodian could not settle.
--
-- Policy
-- ------
-- The drawer's custodian_user_id is the custody boundary. The same boundary
-- is already enforced by close/settle/close-and-settle, by
-- treasury_shifts.custodian_user_id = opened_by, by the one-active-drawer
-- index, and by the cash route in fn_treasury_payment_collect. Administrative
-- roles do not bypass it: PR-6 deliberately removed direct authenticated
-- updates to custodian_user_id, and no reviewed RPC reassigns custody. An
-- administrator who is also the assigned custodian can open the drawer; an
-- administrator who is not the custodian cannot.
--
-- This migration does not change close or settle checks, RLS policies, any
-- row, or any ledger entry. It redefines one function and preserves its owner
-- and ACL through CREATE OR REPLACE.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.fn_treasury_shift_open(
  _treasury_id uuid,
  _opening_counted numeric,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_branch uuid;
  v_actor uuid := auth.uid();
  v_book numeric;
  v_custodian uuid;
  v_prev public.treasury_shifts%rowtype;
  v_id uuid;
begin
  v_branch := public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.shift.use');

  if _opening_counted is null or _opening_counted::text in ('NaN','Infinity','-Infinity') then
    raise exception 'The opening count must be a real amount' USING ERRCODE = '22023';
  end if;
  if _opening_counted < 0 then
    raise exception 'The opening count cannot be negative' USING ERRCODE = '23514';
  end if;

  if exists (select 1 from public.treasury_shifts s
              where s.treasury_id = _treasury_id and s.closed_at is null) then
    raise exception 'This till is already open -- close it before starting a new shift'
      USING ERRCODE = '23505';
  end if;

  -- The book is read under the same row lock add_treasury_tx takes, so the count and the
  -- balance are two views of one instant rather than of two moments with a payment
  -- between them. Custody is read in the same row lock so a concurrent custody change
  -- cannot leave a shift opened for the previous custodian.
  select t.current_balance, t.custodian_user_id
    into v_book, v_custodian
    from public.treasury t
   where t.id = _treasury_id
     and t.deleted_at is null
     for update;

  if not found then
    raise exception 'Treasury not found' USING ERRCODE = '23503';
  end if;

  if v_custodian is null or v_custodian is distinct from v_actor then
    raise exception 'Only the assigned drawer custodian may open this till'
      USING ERRCODE = '42501';
  end if;

  select * into v_prev from public.treasury_shifts s
    where s.treasury_id = _treasury_id and s.closed_at is not null
    order by s.closed_at desc limit 1;

  insert into public.treasury_shifts (
    branch_id, treasury_id, opened_by, opening_counted, opening_book,
    inherited_from, inherited_counted, notes
  ) values (
    v_branch, _treasury_id, v_actor, _opening_counted, coalesce(v_book, 0),
    v_prev.id, v_prev.closing_counted,
    nullif(btrim(coalesce(_notes, '')), '')
  ) returning id into v_id;

  return v_id;
end;
$function$;
