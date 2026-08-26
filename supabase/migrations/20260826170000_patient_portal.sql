-- Patient Portal: an isolated read-only surface for the authenticated patient.
-- No direct table policies are granted to portal users; data is returned only by
-- the narrow SECURITY DEFINER snapshot function below.

CREATE TABLE IF NOT EXISTS public.patient_portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  portal_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','disabled')),
  invited_at timestamptz,
  activated_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_portal_accounts_branch_idx
  ON public.patient_portal_accounts(branch_id);
CREATE INDEX IF NOT EXISTS patient_portal_accounts_auth_user_idx
  ON public.patient_portal_accounts(auth_user_id);

ALTER TABLE public.patient_portal_accounts ENABLE ROW LEVEL SECURITY;
-- Intentionally no authenticated policies: portal reads go through the RPC.

CREATE TABLE IF NOT EXISTS public.patient_portal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
  portal_enabled boolean NOT NULL DEFAULT true,
  support_email text,
  support_phone text,
  complaint_instructions_ar text,
  complaint_instructions_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_portal_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_patient_portal_settings_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT b.tenant_id INTO NEW.tenant_id FROM public.branches b WHERE b.id = NEW.branch_id LIMIT 1;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'branch_unavailable'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_patient_portal_settings_tenant ON public.patient_portal_settings;
CREATE TRIGGER trg_patient_portal_settings_tenant
BEFORE INSERT OR UPDATE OF branch_id ON public.patient_portal_settings
FOR EACH ROW EXECUTE FUNCTION public.set_patient_portal_settings_tenant();

DROP POLICY IF EXISTS patient_portal_settings_select ON public.patient_portal_settings;
CREATE POLICY patient_portal_settings_select
ON public.patient_portal_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR public.user_has_branch_access(branch_id)
);

DROP POLICY IF EXISTS patient_portal_settings_manage ON public.patient_portal_settings;
CREATE POLICY patient_portal_settings_manage
ON public.patient_portal_settings FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.user_has_branch_access(branch_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.user_has_branch_access(branch_id)
  )
);

CREATE OR REPLACE FUNCTION public.patient_portal_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account public.patient_portal_accounts%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_settings public.patient_portal_settings%ROWTYPE;
  v_profile public.clinic_profile%ROWTYPE;
BEGIN
  SELECT * INTO v_account
  FROM public.patient_portal_accounts
  WHERE auth_user_id = auth.uid()
    AND portal_enabled = true
    AND status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient_portal_access_denied'; END IF;

  SELECT * INTO v_patient FROM public.patients WHERE id = v_account.patient_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient_not_found'; END IF;
  SELECT * INTO v_branch FROM public.branches WHERE id = v_account.branch_id;
  SELECT * INTO v_settings FROM public.patient_portal_settings WHERE branch_id = v_account.branch_id;
  SELECT * INTO v_profile FROM public.clinic_profile WHERE branch_id = v_account.branch_id;

  UPDATE public.patient_portal_accounts SET last_seen_at = now(), updated_at = now() WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'patient', jsonb_build_object(
      'id', v_patient.id,
      'patient_code', v_patient.patient_code,
      'first_name_en', v_patient.first_name_en,
      'last_name_en', v_patient.last_name_en,
      'first_name_ar', v_patient.first_name_ar,
      'last_name_ar', v_patient.last_name_ar,
      'name_language', v_patient.name_language,
      'phone', v_patient.phone,
      'email', v_patient.email,
      'dob', v_patient.dob,
      'gender', v_patient.gender
    ),
    'clinic', jsonb_build_object(
      'name_en', COALESCE(v_profile.clinic_name_en, v_branch.name_en),
      'name_ar', COALESCE(v_profile.clinic_name_ar, v_branch.name_ar),
      'support_email', COALESCE(v_settings.support_email, v_profile.email),
      'support_phone', COALESCE(v_settings.support_phone, v_profile.phone, v_branch.phone),
      'complaint_instructions_en', v_settings.complaint_instructions_en,
      'complaint_instructions_ar', v_settings.complaint_instructions_ar
    ),
    'appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'scheduled_at', a.scheduled_at,
        'status', a.status,
        'duration_minutes', a.duration_minutes,
        'service_name_en', COALESCE(s.name_en, a.procedure),
        'service_name_ar', COALESCE(s.name_ar, a.procedure),
        'doctor_name_en', COALESCE(dp.full_name_en, dp.full_name),
        'doctor_name_ar', COALESCE(dp.full_name_ar, dp.full_name),
        'room', a.room
      ) ORDER BY a.scheduled_at DESC)
      FROM public.appointments a
      LEFT JOIN public.services s ON s.id = a.service_id
      LEFT JOIN public.profiles dp ON dp.id = a.doctor_id
      WHERE a.patient_id = v_patient.id AND a.deleted_at IS NULL
      LIMIT 100
    ), '[]'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'invoice_number', i.invoice_number,
        'invoice_date', i.invoice_date,
        'status', i.status,
        'total', i.total,
        'paid_amount', i.paid_amount,
        'balance', GREATEST(COALESCE(i.total,0) - COALESCE(i.paid_amount,0), 0)
      ) ORDER BY i.invoice_date DESC)
      FROM public.invoices i
      WHERE i.patient_id = v_patient.id AND i.deleted_at IS NULL
      LIMIT 50
    ), '[]'::jsonb),
    'physio_cases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'diagnosis', pc.diagnosis,
        'treatment_goal', pc.treatment_goal,
        'status', pc.status,
        'start_date', pc.start_date,
        'expected_sessions', pc.expected_sessions,
        'followup_enabled', pc.followup_enabled,
        'followup_due_date', pc.followup_due_date
      ) ORDER BY pc.start_date DESC)
      FROM public.physio_cases pc
      WHERE pc.patient_id = v_patient.id AND pc.deleted_at IS NULL
      LIMIT 20
    ), '[]'::jsonb),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ps.id,
        'case_id', ps.case_id,
        'session_number', ps.session_number,
        'session_date', ps.session_date,
        'attendance', ps.attendance,
        'pain_level', ps.pain_level,
        'symptom_change', ps.symptom_change,
        'interventions', ps.interventions,
        'home_exercise', ps.home_exercise,
        'next_recommendation', ps.next_recommendation,
        'next_review_plan', ps.next_review_plan
      ) ORDER BY ps.session_date DESC)
      FROM public.physio_sessions ps
      JOIN public.physio_cases pc ON pc.id = ps.case_id
      WHERE pc.patient_id = v_patient.id AND pc.deleted_at IS NULL AND ps.deleted_at IS NULL
      LIMIT 100
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.patient_portal_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION public.patient_portal_set_password_ready()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_portal_accounts
    WHERE auth_user_id = auth.uid() AND portal_enabled = true AND status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.patient_portal_set_password_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_set_password_ready() TO authenticated;

DROP TRIGGER IF EXISTS trg_patient_portal_settings_updated ON public.patient_portal_settings;
CREATE TRIGGER trg_patient_portal_settings_updated
BEFORE UPDATE ON public.patient_portal_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_patient_portal_accounts_updated ON public.patient_portal_accounts;
CREATE TRIGGER trg_patient_portal_accounts_updated
BEFORE UPDATE ON public.patient_portal_accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
