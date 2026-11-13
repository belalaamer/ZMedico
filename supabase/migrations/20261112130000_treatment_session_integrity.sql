-- Treatment-session integrity: status/performed_at consistency, a real session
-- cap, and a guard against shrinking a plan below what was already delivered.
--
-- Every claim below was reproduced on a local Postgres against the schema shape
-- Production has today (see supabase/tests/sessions/treatment_session_integrity.sh,
-- which shows the defects with --pre-fix and their prevention without it).
--
-- What is wrong on `main`:
--
--   1. `performed_at` and `status` can disagree. The screen sets `performed_at`
--      when completing and clears it when returning to `pending`, but does
--      nothing for `completed -> missed`. A direct SQL update leaves a session
--      marked "missed" with a performed timestamp, and reports read it as work
--      that happened. Nothing in the database normalises either direction.
--   2. There is no cap at all. A plan that sold 6 sessions can record a 7th
--      completion by a plain UPDATE, and two completions running at once can both
--      pass any check that counts without locking.
--   3. A completed session moved to another plan is not checked against the
--      receiving plan's cap.
--   4. `treatment_plans.total_sessions` can be lowered below the number of
--      sessions already delivered, which makes `remaining` negative and can
--      re-trigger invoicing logic that keys off `done >= total`.
--
-- The fix is one guard, not four:
--   * `performed_at` is normalised in BOTH directions on every write, so the two
--     columns cannot contradict each other regardless of which client wrote.
--   * Only a transition *into* `completed` (or a completed row moving plan) takes
--     the cap check, and that check first takes `FOR UPDATE` on the plan row. Two
--     concurrent completions therefore serialise: the second counts after the
--     first commits. This is the same lock the invoice trigger takes, and it is
--     always session row -> plan row, so the order is consistent and cannot
--     deadlock with it.
--   * Re-opening a completed session stays allowed, because that is a legitimate
--     correction; the completion is recorded in the audit trail before
--     `performed_at` is cleared.
--   * Lowering `total_sessions` below `completed` is refused.
--
-- This file is deliberately independent of PR #280: it depends on nothing that PR
-- adds, and #280 no longer installs its own (weaker, unlocked) completion guard,
-- so there is exactly one guard on these rows.
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
begin
  -- `performed_at` describes the status. Normalise both directions so a client
  -- that forgets it (or a direct SQL update) cannot leave the pair contradictory.
  if new.status = 'completed' then
    if new.performed_at is null then
      new.performed_at := coalesce(new.updated_at, now());
    end if;
  else
    new.performed_at := null;
  end if;

  -- Entering `completed` covers: a new completed row, an existing row whose
  -- status was not completed, and a completed row moved to another plan.
  v_entering := new.status = 'completed' and (
    tg_op = 'INSERT'
    or coalesce(old.status, '') <> 'completed'
    or old.treatment_plan_id is distinct from new.treatment_plan_id
  );

  if v_entering then
    -- Serialise concurrent completions on the plan. Without this, two sessions
    -- both count "one remaining" and both commit.
    select total_sessions into v_total
      from public.treatment_plans
     where id = new.treatment_plan_id
       for update;

    -- No plan row: leave the referential failure to the foreign key.
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

-- Remove the unlocked guard an earlier draft of #280 installed, if it is present.
-- One guard, one policy for these rows.
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
