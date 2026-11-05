-- (ب) P3, part 2 -- SEPARABLE: make a close mean what it says.
--
-- Status: APPLIED to Production `rqcmnfzfytyyicelvifk` on 2026-11-05, owner-approved
-- COMMIT. Designed and proved first with BEGIN; ... ROLLBACK; (zero effect) -- and
-- re-measured after the COMMIT: see docs/TREASURY_SHIFT_APPLY_20261105.md for the apply
-- receipts, the prosrc length/md5 byte-fidelity gate over the two trigger functions this
-- file defines, and the before/after row census that shows the apply moved no money.
--
-- The custody cycle in 20261105130000_treasury_shift_cycle.sql works without anything in
-- this file; it was separable at design time and the owner approved both together, to
-- close the accounting loop from the first day. This file fixes the three ways a *daily
-- close* is currently not trustworthy, each of which was measured on Production.
--
-- 1. The close is signed with numbers the browser sent.
--    DailyClose.tsx:139-149 posts opening_cash, expected_cash and non_cash_total it read
--    back from fn_treasury_day_cash_summary, and variance is
--    GENERATED ALWAYS AS (counted_cash - expected_cash). A client that sends an
--    "expected" of its own invents the variance, and daily_close_immutable then keeps the
--    forgery forever. Recomputing the three server-side, from the same primitive the
--    screen already displays, makes the stored row and the shown row one and the same.
--    treasury_daily_closes held 0 rows on Production at design time, so no historical
--    figure is rewritten -- this only binds the future.
--
-- 2. A close dated in the future locks the till permanently.
--    _treasury_assert_open_period raises for any _business_date <= max(business_date).
--    Nothing today stops a close for 2030-01-01, which would refuse every payment and
--    expense ever after for that till. Bound the date to today (Africa/Cairo) at insert.
--
-- 3. A manual treasury entry ignores the close entirely.
--    The period lock is called from the payments guard, the expenses guard and
--    transfer_treasury_funds. It is NOT called from add_treasury_tx, so a hand-posted
--    income/expense (reference_type null / 'manual' / 'adjustment') lands inside a closed
--    day. Measured on Production: 2 'manual' + 2 'adjustment' rows exist.
--    The fix is a BEFORE INSERT trigger scoped to exactly those rows. Payment-derived and
--    reversal rows are exempt by construction -- their date is asserted where the payment
--    is written -- so the desk taking a patient's money is never affected, and regression
--    tests #6/#7/#12, which go through payments, never see it.
--
-- 4. WHY THE CLOSE WAS NEVER USED, stated plainly for the record:
--    DailyClose.tsx defaults business_date to today, and closing today locks every
--    payment dated today (payment_period_guard -> _treasury_assert_open_period:
--    "_business_date <= v_last_close"). A manager who closes at 18:00 blocks the evening
--    patients. That is the mechanism behind 0 close rows, and it is a front-end default,
--    not a data problem: the desk should close the day that has finished. The UI plan
--    defaults the picker to yesterday and keeps max=today. The custody cycle in part 1
--    never blocks money, which is what makes closing safe to do every day.

-- ---------------------------------------------------------------------------
-- 1 + 2. a close row carries only numbers the server computed
-- ---------------------------------------------------------------------------
create or replace function public._tg_daily_close_recompute()
returns trigger
language plpgsql
as $function$
declare
  v_open numeric;
  v_expected numeric;
  v_non_cash numeric;
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
begin
  if NEW.business_date is null then
    raise exception 'A daily close needs its business date' USING ERRCODE = '22004';
  end if;
  if NEW.business_date > v_today then
    raise exception 'A daily close cannot be dated in the future -- it would lock the till'
      USING ERRCODE = '23514';
  end if;
  if NEW.counted_cash is null or NEW.counted_cash::text in ('NaN','Infinity','-Infinity')
     or NEW.counted_cash < 0 then
    raise exception 'A daily close needs a real counted amount' USING ERRCODE = '23514';
  end if;

  -- The same primitive the screen shows. It enforces its own session, permission and
  -- branch checks as the definer it is, so a close cannot be signed for a till the
  -- caller does not manage.
  --
  -- Measured (dry-run receipt '09'): fn_treasury_day_cash_summary itself refuses a caller
  -- with no active session (42501), which is also what a service-key writer would meet --
  -- and no service code writes closes today (treasury_daily_closes holds 0 rows ever).
  -- Stated as a rule here so the failure names the reason: a close is a human count.
  if not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'A daily close must be signed by a person in an active session -- a service key cannot count a drawer'
      USING ERRCODE = '42501';
  end if;

  select s.opening_cash, s.expected_cash, s.non_cash_total
    into v_open, v_expected, v_non_cash
    from public.fn_treasury_day_cash_summary(NEW.treasury_id, NEW.business_date) s;

  NEW.opening_cash   := v_open;
  NEW.expected_cash  := v_expected;
  NEW.non_cash_total := v_non_cash;
  -- locked stays whatever the caller sent: the column default is true and immutability
  -- is already enforced by daily_close_immutable.
  return NEW;
end;
$function$;

drop trigger if exists daily_close_recompute on public.treasury_daily_closes;
create trigger daily_close_recompute
  before insert on public.treasury_daily_closes
  for each row execute function public._tg_daily_close_recompute();

-- ---------------------------------------------------------------------------
-- 3. hand-posted treasury entries respect the closed period
-- ---------------------------------------------------------------------------
create or replace function public._tg_treasury_manual_period_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Only entries a person typed by hand. Payments and expenses assert their own date at
  -- their own source; reversals must stay possible for a payment from any earlier day.
  if NEW.reference_type is null
     or NEW.reference_type in ('manual', 'adjustment') then
    perform public._treasury_assert_open_period(
      (select t.branch_id from public.treasury t where t.id = NEW.treasury_id),
      NEW.treasury_id,
      (statement_timestamp() at time zone 'Africa/Cairo')::date
    );
  end if;
  return NEW;
end;
$function$;

drop trigger if exists treasury_manual_period_guard on public.treasury_transactions;
create trigger treasury_manual_period_guard
  before insert on public.treasury_transactions
  for each row execute function public._tg_treasury_manual_period_guard();

-- ---------------------------------------------------------------------------
-- Both trigger functions: revoke EXECUTE.
--
-- A trigger function is not a REST entry point. Left alone it carries the schema default
-- EXECUTE-to-PUBLIC, which PostgREST publishes as /rpc/<name> -- the same reason
-- 20261105130000_treasury_shift_cycle.sql section 2 revokes its own two. Neither body is
-- exploitable by a direct call (each reads NEW, which is undefined outside trigger
-- context, so Postgres raises before touching a row), but the surface should not exist to
-- be probed.
--
-- Measured on Production immediately after this file was applied: authenticated execute
-- was true on both. Applied there as a follow-up, so Production and this file agree.
-- ---------------------------------------------------------------------------
revoke all on function public._tg_daily_close_recompute() from public, anon, authenticated;
revoke all on function public._tg_treasury_manual_period_guard() from public, anon, authenticated;
