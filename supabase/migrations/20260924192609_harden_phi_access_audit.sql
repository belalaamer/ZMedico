-- Harden PHI read-audit integrity.
--
-- The application records reads through log_phi_access(). Authenticated users
-- must not be able to bypass that resolver by inserting arbitrary audit rows
-- directly, and the SECURITY DEFINER RPC must only accept audit events for PHI
-- the caller is actually authorized to view.

REVOKE INSERT ON TABLE public.phi_access_log FROM authenticated;
DROP POLICY IF EXISTS phi_log_insert_self ON public.phi_access_log;

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
  v_actor       uuid := auth.uid();
  v_patient     uuid;
  v_branch      uuid;
  v_permission  text;
  v_action      text := COALESCE(p_action, 'view');
BEGIN
  -- Audit logging must never interrupt a clinical screen.
  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  IF p_entity_type NOT IN (
    'patient','medical_record','physio_case','prescription','document',
    'dental_chart','treatment_plan','vitals','patient_list','invoice'
  ) OR v_action NOT IN ('view','search','export','print') THEN
    RETURN;
  END IF;

  v_permission := CASE p_entity_type
    WHEN 'patient'        THEN 'patients.view'
    WHEN 'patient_list'   THEN 'patients.view'
    WHEN 'medical_record' THEN 'medical_records.view'
    WHEN 'physio_case'    THEN 'medical_records.view'
    WHEN 'prescription'   THEN 'medical_records.view'
    WHEN 'document'       THEN 'medical_records.view'
    WHEN 'dental_chart'   THEN 'medical_records.view'
    WHEN 'vitals'         THEN 'vitals.view'
    WHEN 'treatment_plan' THEN 'treatment_plans.view'
    WHEN 'invoice'        THEN 'invoices.view'
    ELSE NULL
  END;

  IF v_permission IS NULL
     OR NOT public.has_permission(v_actor, v_permission) THEN
    RETURN;
  END IF;

  -- Resolve the subject from the entity itself whenever an entity id exists.
  -- Never trust a caller-supplied patient id to authorize a different record.
  IF p_entity_id IS NOT NULL THEN
    -- Legacy UI versions log collection-level Documents/Dental views by
    -- passing patientId as both entityId and patientId. Preserve that shape
    -- during rollout while newer clients pass entityId=NULL for collections.
    IF p_entity_type IN ('document', 'dental_chart')
       AND p_patient_id IS NOT NULL
       AND p_entity_id = p_patient_id THEN
      v_patient := p_patient_id;
    ELSE
      v_patient := CASE p_entity_type
      WHEN 'patient'        THEN p_entity_id
      WHEN 'medical_record' THEN (SELECT patient_id FROM public.medical_records WHERE id = p_entity_id)
      WHEN 'physio_case'    THEN (SELECT patient_id FROM public.physio_cases WHERE id = p_entity_id)
      WHEN 'prescription'   THEN (SELECT patient_id FROM public.prescriptions WHERE id = p_entity_id)
      WHEN 'document'       THEN (SELECT patient_id FROM public.patient_documents WHERE id = p_entity_id)
      WHEN 'dental_chart'   THEN (SELECT patient_id FROM public.dental_chart WHERE id = p_entity_id)
      WHEN 'treatment_plan' THEN (SELECT patient_id FROM public.treatment_plans WHERE id = p_entity_id)
      WHEN 'vitals'         THEN (SELECT patient_id FROM public.vital_signs WHERE id = p_entity_id)
      WHEN 'invoice'        THEN (SELECT patient_id FROM public.invoices WHERE id = p_entity_id)
      WHEN 'patient_list'   THEN NULL
      ELSE NULL
      END;
    END IF;

    IF p_entity_type <> 'patient_list' AND v_patient IS NULL THEN
      RETURN;
    END IF;

    IF p_patient_id IS NOT NULL
       AND v_patient IS NOT NULL
       AND p_patient_id <> v_patient THEN
      RETURN;
    END IF;
  ELSIF p_entity_type <> 'patient_list' THEN
    v_patient := p_patient_id;
  END IF;

  IF p_entity_type <> 'patient_list' THEN
    IF v_patient IS NULL THEN
      RETURN;
    END IF;

    SELECT branch_id
      INTO v_branch
      FROM public.patients
     WHERE id = v_patient
       AND deleted_at IS NULL;

    IF v_branch IS NULL
       OR NOT public.user_has_branch_access(v_branch) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.phi_access_log (
    user_id, entity_type, entity_id, patient_id, action, context, branch_id
  )
  VALUES (
    v_actor, p_entity_type, p_entity_id, v_patient, v_action,
    left(COALESCE(p_context, ''), 200), v_branch
  );

EXCEPTION WHEN OTHERS THEN
  -- Keep the original non-blocking safety contract. Do not rethrow.
  BEGIN
    INSERT INTO public.client_errors (user_id, kind, message, component)
    VALUES (v_actor, 'phi_audit_failure', left(SQLERRM, 500), 'log_phi_access');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.log_phi_access(text, uuid, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_phi_access(text, uuid, uuid, text, text)
  TO authenticated, service_role;
