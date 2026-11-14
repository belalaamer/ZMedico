-- Treatment-session integrity: status/performed_at consistency, a real session
-- cap, plan reassignment, and a guard against shrinking a plan below what was
-- already delivered.
--
-- Every claim below was reproduced on a local Postgres against the schema shape
-- Production has today (supabase/tests/sessions/treatment_session_integrity.sh
-- shows the defects with --pre-fix and their prevention without it).
--
-- What is wrong on `main`:
--
--   1. `performed_at` and `status` can disagree. The screen sets `performed_at`
--      when completing and clears it when returning to `pending`, but does
--      nothing for `completed -> missed`. Nothing in the database normalises
--      either direction.
--   2. There is no cap. A plan that sold 6 sessions can record a 7th completion
--      by a plain UPDATE, and two completions at once can both pass any check
--      that counts without locking.
--   3. A completed session moved to another plan is not checked against the
--      receiving plan's cap, and the source plan is left inconsistent.
--   4. `treatment_plans.total_sessions` can be lowered below what was delivered,
--      which makes `remaining` negative and can re-trigger invoicing logic.
--
-- Two details that decide the implementation and were checked, not assumed:
--
--   * Trigger order. Postgres fires same-timing BEFORE triggers in NAME order.
--     `treatment_sessions_integrity` sorts before `trg_ts_updated_at`
--     ("tre" < "trg"), so at the moment this guard runs, `new.updated_at` still
--     holds the row's PREVIOUS value. Using `coalesce(new.updated_at, now())`
--     would stamp `performed_at` with the last edit's time, which is not "when
--     the session was completed". This guard therefore ignores `new.updated_at`.
--
--   * Time source. `performed_at` means "when the completing statement ran", so
--     this uses `statement_timestamp()`, NOT `now()`. `now()` is
--     `transaction_timestamp()`: a transaction that begins, does other work for
--     ten minutes, and only then completes a session would record a completion
--     time ten minutes early. `statement_timestamp()` is fixed at the start of
--     the completing command and is immune to earlier work in the same
--     transaction. (Verified in the harness by completing inside a transaction
--     that sleeps first.)
--
--   * Lock order. This guard takes the plan row(s) with `FOR UPDATE` BEFORE it
--     counts. When #281 (T3) is applied, its invoice trigger takes the plan row
--     FOR UPDATE on the AFTER timing, which is strictly after this BEFORE guard
--     in the same statement, so the lock is already held and re-entry is free.
--     On `main` today that trigger has no FOR UPDATE at all, so there is no
--     competing plan lock. Either way the order is: session row -> plan row(s)
--     in ascending id order, which no other path cycles against.
--
-- This file is deliberately independent of PR #280: it depends on nothing that PR
-- adds, and #280 no longer installs its own completion guard, so there is exactly
-- one guard on these rows.
--
-- Status: NOT APPLIED. Nothing here has run against Production.

-- ---------------------------------------------------------------------------
-- 1. Session guard
-- ---------------------------------------------------------------------------
create or replace function public.tg_treatment_sessions_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_completed integer;
  v_entering boolean;
  v_moving boolean;
  v_needs_plans boolean;
  v_src_total integer;
  v_src_done integer;
  v_src_invoice uuid;
  v_src_status text;
begin
  -- `performed_at` describes the status. Normalise both directions. `now()` is
  -- the transaction clock, NOT `new.updated_at`, because the updated_at trigger
  -- has not run yet at this point (see the header).
  if new.status = 'completed' then
    if new.performed_at is null then
      new.performed_at := statement_timestamp();
    end if;
  else
    new.performed_at := null;
  end if;

  v_moving := tg_op = 'UPDATE' and old.treatment_plan_id is distinct from new.treatment_plan_id;
  v_entering := new.status = 'completed' and (
    tg_op = 'INSERT'
    or coalesce(old.status, '') <> 'completed'
    or v_moving
  );
  v_needs_plans := v_entering or (v_moving and old.status = 'completed');

  -- Lock every plan this statement can change, in a deterministic order, BEFORE
  -- any count. Two concurrent completions therefore serialise; two opposite moves
  -- (A->B and B->A) take the same lock order and cannot deadlock.
  if v_needs_plans then
    if tg_op = 'INSERT' then
      perform 1 from public.treatment_plans where id = new.treatment_plan_id for update;
    else
      perform 1 from (
        select id from public.treatment_plans
         where id in (new.treatment_plan_id, old.treatment_plan_id)
         order by id
         for update
      ) locked;
    end if;
  end if;

  -- Cap on the receiving plan.
  if v_entering then
    select total_sessions into v_total
      from public.treatment_plans where id = new.treatment_plan_id;

    if v_total is not null then
      select count(*) into v_completed
        from public.treatment_sessions
       where treatment_plan_id = new.treatment_plan_id
         and status = 'completed'
         and (tg_op = 'INSERT' or id <> new.id);

      if v_completed >= v_total then
        raise exception 'TREATMENT_PLAN_SESSION_CAP: this plan sold % session(s) and % are already completed; re-open a session before completing another one',
          v_total, v_completed
          using errcode = '23514',
                hint = 'Re-open a completed session, or raise the plan''s total_sessions.';
      end if;
    end if;
  end if;

  -- A completed session leaving its plan. The source plan must stay honest: its
  -- status is recomputed, and it may not be silently under-delivered if an
  -- invoice has already been issued for the sessions it recorded.
  if v_moving and old.status = 'completed' then
    select total_sessions, invoice_id, status
      into v_src_total, v_src_invoice, v_src_status
      from public.treatment_plans where id = old.treatment_plan_id;

    if v_src_total is not null then
      select count(*) into v_src_done
        from public.treatment_sessions
       where treatment_plan_id = old.treatment_plan_id
         and status = 'completed'
         and id <> new.id;

      if v_src_done < v_src_total then
        if v_src_invoice is not null then
          raise exception 'TREATMENT_PLAN_SESSION_MOVE_INVOICED: plan % already has invoice % for % delivered session(s); moving one out would leave it under-delivered against a bill already issued',
            old.treatment_plan_id, v_src_invoice, v_src_total
            using errcode = '23514',
                  hint = 'Re-open the session (which is audited), then move the reopened placeholder.';
        end if;

        -- Keep the two plans consistent: a plan that is no longer fully delivered
        -- is not `completed`. A cancelled plan is left alone.
        if v_src_status = 'completed' then
          update public.treatment_plans
             set status = 'active', updated_at = now()
           where id = old.treatment_plan_id and status = 'completed';
        end if;
      end if;
    end if;
  end if;

  -- Keep a trace of completion changes before the timestamp is cleared. Audit
  -- failures must never block a clinical correction, so this is best-effort.
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    begin
      insert into public.audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
      values (
        auth.uid(), null, 'treatment_session.status', 'treatment_session', new.id,
        jsonb_build_object('status', old.status, 'performed_at', old.performed_at),
        jsonb_build_object('status', new.status, 'performed_at', new.performed_at)
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.tg_treatment_sessions_integrity() from public, anon, authenticated;

drop trigger if exists treatment_sessions_integrity on public.treatment_sessions;
create trigger treatment_sessions_integrity
  before insert or update on public.treatment_sessions
  for each row execute function public.tg_treatment_sessions_integrity();

-- Remove the unlocked guard an earlier draft of #280 installed, if present.
drop trigger if exists treatment_sessions_guard_completion on public.treatment_sessions;
drop function if exists public.tg_treatment_sessions_guard_completion();

-- ---------------------------------------------------------------------------
-- 2. Plan guard: total_sessions may not drop below what was delivered
-- ---------------------------------------------------------------------------
create or replace function public.tg_treatment_plans_guard_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed integer;
begin
  if new.total_sessions is distinct from old.total_sessions then
    select count(*) into v_completed
      from public.treatment_sessions
     where treatment_plan_id = new.id
       and status = 'completed';

    if new.total_sessions < v_completed then
      raise exception 'TREATMENT_PLAN_SESSION_CAP: % session(s) are already completed, so total_sessions cannot be lowered to %',
        v_completed, new.total_sessions
        using errcode = '23514',
              hint = 'Keep total_sessions at or above the completed count.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_treatment_plans_guard_total() from public, anon, authenticated;

drop trigger if exists treatment_plans_guard_total on public.treatment_plans;
create trigger treatment_plans_guard_total
  before update of total_sessions on public.treatment_plans
  for each row execute function public.tg_treatment_plans_guard_total();
