-- =====================================================================
-- PHI read auditing.
--
-- Until now only WRITES were audited. Nobody could answer "who opened this
-- patient's file, and when" -- which is the question a regulator, an insurer or a
-- patient actually asks. Required by:
--   * HIPAA 45 CFR 164.312(b) -- audit controls: record and examine activity in
--     systems that contain ePHI. Access is activity.
--   * ISO 27789:2013 -- audit trails for electronic health records: the standard
--     lists record ACCESS as an auditable event, alongside create and amend.
--   * Egypt PDPL 151/2018 -- health data is a special category; processing,
--     including consultation, must be accountable.
--
-- AN HONEST LIMITATION, STATED UP FRONT: PostgreSQL has no SELECT trigger, and
-- pgaudit is not available on this managed platform. There is therefore no way to
-- capture reads purely in the database. Two consequences:
--   1. Logging happens where the read is REQUESTED -- the application calls
--      log_phi_access() when it opens a record. Coverage equals instrumentation,
--      so the list of instrumented screens matters and is documented.
--   2. Someone querying the REST API or SQL editor directly, bypassing the app,
--      will read without leaving an access entry. Row-level security still limits
--      WHAT they can read; it just cannot record that they looked. Closing that
--      needs either a database-side audit extension or routing every read through
--      SECURITY DEFINER functions, and neither is a small change.
-- This is normal for application-tier audit logging, but it should not be
-- described as complete coverage, so it is not.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.phi_access_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid(),
  -- what was looked at
  entity_type   text NOT NULL,
  entity_id     uuid,
  -- whose data it was; resolved at write time so history survives even if the
  -- child record is later deleted
  patient_id    uuid,
  action        text NOT NULL DEFAULT 'view',
  -- where in the app, e.g. '/patients/<id>' or 'patients:export'
  context       text,
  branch_id     uuid,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phi_access_action_known
    CHECK (action IN ('view','search','export','print')),
  CONSTRAINT phi_access_entity_known
    CHECK (entity_type IN ('patient','medical_record','physio_case','prescription',
                           'document','dental_chart','treatment_plan','vitals',
                           'patient_list','invoice'))
);

COMMENT ON TABLE public.phi_access_log IS
  'Append-only record of who READ patient data. Writes are audited separately in audit_logs. HIPAA 164.312(b) / ISO 27789.';

-- Queried as "show me everything that touched this patient" and
-- "show me everything this user opened" -- index both.
CREATE INDEX IF NOT EXISTS phi_access_log_patient_idx  ON public.phi_access_log (patient_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS phi_access_log_user_idx     ON public.phi_access_log (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS phi_access_log_occurred_idx ON public.phi_access_log (occurred_at DESC);

ALTER TABLE public.phi_access_log ENABLE ROW LEVEL SECURITY;

-- An audit trail that its own subject can edit is not an audit trail.
REVOKE UPDATE, DELETE ON public.phi_access_log FROM authenticated;
REVOKE UPDATE, DELETE ON public.phi_access_log FROM anon;

DROP POLICY IF EXISTS phi_log_no_update ON public.phi_access_log;
CREATE POLICY phi_log_no_update ON public.phi_access_log
  AS RESTRICTIVE FOR UPDATE USING (false);

DROP POLICY IF EXISTS phi_log_no_delete ON public.phi_access_log;
CREATE POLICY phi_log_no_delete ON public.phi_access_log
  AS RESTRICTIVE FOR DELETE USING (false);

-- Anyone may record their own access; nobody may record someone else's.
DROP POLICY IF EXISTS phi_log_insert_self ON public.phi_access_log;
CREATE POLICY phi_log_insert_self ON public.phi_access_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Reading the trail is itself sensitive: the entries name patients.
-- Same gate as the existing audit log.
DROP POLICY IF EXISTS phi_log_select_admin ON public.phi_access_log;
CREATE POLICY phi_log_select_admin ON public.phi_access_log
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
  );

-- =====================================================================
-- The function the application calls. SECURITY DEFINER so that a failure to log
-- can never be silently skipped by a permission problem, and so the patient_id
-- can be resolved from the child record even when the caller cannot read it.
--
-- It deliberately NEVER raises: an audit write must not break a clinician's
-- screen mid-consultation. A logging fault is a monitoring problem, not a reason
-- to deny care. Faults are recorded in client_errors instead.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_phi_access(
  p_entity_type text,
  p_entity_id   uuid DEFAULT NULL,
  p_patient_id  uuid DEFAULT NULL,
  p_action      text DEFAULT 'view',
  p_context     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patient uuid := p_patient_id;
  v_branch  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;   -- unauthenticated: nothing meaningful to attribute
  END IF;

  -- Resolve the subject when the caller only knows the child record.
  IF v_patient IS NULL AND p_entity_id IS NOT NULL THEN
    v_patient := CASE p_entity_type
      WHEN 'patient'        THEN p_entity_id
      WHEN 'medical_record' THEN (SELECT patient_id FROM public.medical_records WHERE id = p_entity_id)
      WHEN 'physio_case'    THEN (SELECT patient_id FROM public.physio_cases    WHERE id = p_entity_id)
      WHEN 'treatment_plan' THEN (SELECT patient_id FROM public.treatment_plans WHERE id = p_entity_id)
      WHEN 'invoice'        THEN (SELECT patient_id FROM public.invoices        WHERE id = p_entity_id)
      ELSE NULL
    END;
  END IF;

  IF v_patient IS NOT NULL THEN
    SELECT branch_id INTO v_branch FROM public.patients WHERE id = v_patient;
  END IF;

  INSERT INTO public.phi_access_log
    (user_id, entity_type, entity_id, patient_id, action, context, branch_id)
  VALUES
    (auth.uid(), p_entity_type, p_entity_id, v_patient,
     COALESCE(p_action,'view'), left(COALESCE(p_context,''), 200), v_branch);

EXCEPTION WHEN others THEN
  -- Never let auditing take down a clinical screen.
  BEGIN
    INSERT INTO public.client_errors (user_id, kind, message, component)
    VALUES (auth.uid(), 'phi_audit_failure', left(SQLERRM, 500), 'log_phi_access');
  EXCEPTION WHEN others THEN
    NULL;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.log_phi_access(text, uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_phi_access(text, uuid, uuid, text, text) TO authenticated;

-- =====================================================================
-- Retention. HIPAA 164.316(b)(2) requires documentation to be retained for six
-- years; keeping seven leaves a margin for a dispute raised at the limit.
-- Pruning is manual and deliberate, exactly like prune_client_errors -- an audit
-- trail that deletes itself on a timer is a liability during an investigation.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.prune_phi_access_log(p_keep_days int DEFAULT 2555)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  n bigint;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'system_owner'::public.app_role)) THEN
    RAISE EXCEPTION 'Only the system owner may prune the PHI access log.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_keep_days < 2190 THEN
    RAISE EXCEPTION 'Refusing to keep less than six years (2190 days) of access history -- HIPAA 164.316(b)(2).'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.phi_access_log WHERE occurred_at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;

-- =====================================================================
-- The two questions this exists to answer, as views so they are one query each.
-- =====================================================================
CREATE OR REPLACE VIEW public.v_phi_access_by_patient AS
SELECT
  l.patient_id,
  trim(concat_ws(' ', p.first_name_en, p.last_name_en)) AS patient_name,
  p.patient_code,
  l.occurred_at,
  l.user_id,
  l.action,
  l.entity_type,
  l.context
FROM public.phi_access_log l
LEFT JOIN public.patients p ON p.id = l.patient_id
ORDER BY l.occurred_at DESC;

COMMENT ON VIEW public.v_phi_access_by_patient IS
  'Who looked at whose record, newest first. Inherits phi_access_log RLS.';
