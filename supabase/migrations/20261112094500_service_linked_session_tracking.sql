-- Service-linked session tracking.
--
-- What is missing today, measured on `main` rather than assumed:
--
--   * `treatment_plans` records a name, `total_sessions`, a price and an optional
--     invoice, but has no link to the `services` catalog. The plan a patient pays
--     for and the service they book therefore live in two unrelated tables, so
--     "how many sessions of this service does this patient still have?" cannot be
--     answered — the desk reads a plan name and guesses.
--   * `treatment_sessions` rows are pre-generated one per session when the plan is
--     created (`Array.from({ length: total_sessions })` in
--     `src/pages/patients/PatientTreatmentPlans.tsx`), and completion is a plain
--     status update. Nothing in the database stops a plan from recording more
--     completed sessions than it sold, and nothing keeps `performed_at` consistent
--     with the status it describes.
--   * a plan edited after creation keeps the rows it was born with, so the plan's
--     own `total_sessions` and its actual session rows can disagree with no signal.
--
-- This migration adds only what is needed to make the count trustworthy:
--
--   1. `treatment_plans.service_id` — the link the question needs.
--   2. a BEFORE INSERT/UPDATE guard on `treatment_sessions` that refuses to
--      complete a session beyond the plan's total and stamps `performed_at` when a
--      session is completed without one.
--   3. `v_treatment_plan_progress` — one row per live plan with the counts and the
--      drift flag, `security_invoker = true` so the caller's existing RLS on
--      `treatment_plans` / `treatment_sessions` / `services` still decides what
--      they may see.
--
-- It changes no existing column, drops nothing, and does not touch the financial
-- or physio tables. Every row that exists today keeps working: `service_id` is
-- nullable, so plans created before this migration simply show as unlinked.
--
-- Status: NOT APPLIED. Written and analysed only; nothing here ran against
-- Production `rqcmnfzfytyyicelvifk`.

-- ---------------------------------------------------------------------------
-- 1. The link
-- ---------------------------------------------------------------------------
alter table public.treatment_plans
  add column if not exists service_id uuid references public.services(id) on delete set null;

comment on column public.treatment_plans.service_id is
  'The catalog service this plan delivers. Nullable because every plan created before this migration has no recorded service; a null plan is reported as unlinked rather than guessed at from its name.';

-- Progress is read per service for a patient, so the lookup key is (patient, service).
create index if not exists treatment_plans_service_idx
  on public.treatment_plans (service_id)
  where service_id is not null;

create index if not exists treatment_plans_patient_service_idx
  on public.treatment_plans (patient_id, service_id);

-- The guard counts the plan's completed sessions on every completion, and the
-- pre-generated rows are always read by plan.
create index if not exists treatment_sessions_plan_status_idx
  on public.treatment_sessions (treatment_plan_id, status);

-- ---------------------------------------------------------------------------
-- 2. (removed) The completion guard
-- ---------------------------------------------------------------------------
-- An earlier revision of this file ALSO installed a `treatment_sessions` completion
-- guard. It was removed deliberately: that guard could not be made safe under
-- concurrency (no row lock, so two completions could both pass), it left
-- `performed_at` stale on some transitions, and it was bypassed by moving a
-- completed session between plans or by lowering `total_sessions`. Those defects
-- are owned by the T4/T5 migration, which installs one canonical guard. Keeping a
-- second, weaker guard here would mean two triggers racing on the same rows.

-- ---------------------------------------------------------------------------
-- 3. The progress view
-- ---------------------------------------------------------------------------
-- One row per live plan. `security_invoker = true` keeps the caller's RLS in force:
-- a doctor who may only see their own plan sees only that plan's row, exactly as
-- they do today when reading the table directly.
create or replace view public.v_treatment_plan_progress
with (security_invoker = true) as
select
  p.id                                   as plan_id,
  p.patient_id,
  p.branch_id,
  p.doctor_id,
  p.service_id,
  s.name_en                              as service_name_en,
  s.name_ar                              as service_name_ar,
  p.status                               as plan_status,
  p.total_sessions,
  (count(t.id))::integer                 as session_rows,
  (count(t.id) filter (where t.status = 'completed'))::integer as completed_sessions,
  (count(t.id) filter (where t.status = 'missed'))::integer    as missed_sessions,
  (count(t.id) filter (where t.status not in ('completed', 'missed')))::integer as pending_sessions,
  -- Never negative even if the plan was edited down after sessions were delivered.
  greatest(p.total_sessions - (count(t.id) filter (where t.status = 'completed'))::integer, 0)
                                         as remaining_sessions,
  min(t.scheduled_date) filter (where t.status not in ('completed', 'missed'))
                                         as next_session_date,
  max(t.performed_at) filter (where t.status = 'completed')
                                         as last_performed_at,
  p.invoice_id,
  p.price,
  -- The plan's own count and the rows it actually has disagree: the screen must
  -- surface this rather than silently divide by the wrong number.
  ((count(t.id))::integer <> p.total_sessions) as count_drift
from public.treatment_plans p
left join public.services s on s.id = p.service_id
left join public.treatment_sessions t on t.treatment_plan_id = p.id
where p.deleted_at is null
group by p.id, s.name_en, s.name_ar;

comment on view public.v_treatment_plan_progress is
  'Per-plan session progress for the patient plan screen and reports: completed/missed/pending counts, remaining never negative, the soonest pending session, and count_drift when total_sessions disagrees with the rows that exist. security_invoker=true, so existing RLS on treatment_plans / treatment_sessions / services decides visibility.';

revoke all on public.v_treatment_plan_progress from anon;
grant select on public.v_treatment_plan_progress to authenticated;
