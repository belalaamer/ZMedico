-- Durable first-login guard for auto-provisioned Patient Portal accounts.
ALTER TABLE public.patient_portal_accounts
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Backfill only accounts explicitly marked by the existing provisioning metadata.
UPDATE public.patient_portal_accounts a
SET must_change_password = true,
    updated_at = now()
FROM auth.users u
WHERE u.id = a.auth_user_id
  AND COALESCE((u.raw_user_meta_data ->> 'force_password_change')::boolean, false) = true
  AND a.status = 'active'
  AND a.portal_enabled = true;

CREATE OR REPLACE FUNCTION public.patient_portal_password_state()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account public.patient_portal_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_account
  FROM public.patient_portal_accounts
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND OR v_account.portal_enabled IS DISTINCT FROM true OR v_account.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('active', false, 'must_change_password', false);
  END IF;

  RETURN jsonb_build_object('active', true, 'must_change_password', v_account.must_change_password);
END;
$$;
REVOKE ALL ON FUNCTION public.patient_portal_password_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_password_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.patient_portal_complete_password_change()
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.patient_portal_accounts
  SET must_change_password = false,
      activated_at = COALESCE(activated_at, now()),
      updated_at = now()
  WHERE auth_user_id = auth.uid()
    AND portal_enabled = true
    AND status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.patient_portal_complete_password_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_complete_password_change() TO authenticated;

-- Prevent direct RPC callers from reading portal data before changing the temporary password.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.patient_portal_snapshot()'::regprocedure) INTO v_definition;
  v_definition := replace(
    v_definition,
    'IF NOT FOUND THEN RAISE EXCEPTION ''patient_portal_access_denied''; END IF;',
    'IF NOT FOUND THEN RAISE EXCEPTION ''patient_portal_access_denied''; END IF;\n  IF v_account.must_change_password THEN RAISE EXCEPTION ''patient_portal_password_change_required''; END IF;'
  );
  EXECUTE v_definition;
END;
$$;

-- Runtime authorization context used by the Worker/Edge sender. It returns only
-- delivery metadata, never a password or a clinical record.
CREATE OR REPLACE FUNCTION public.patient_portal_send_context(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient public.patients%ROWTYPE;
  v_account public.patient_portal_accounts%ROWTYPE;
  v_allowed boolean := false;
  v_is_system_owner boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;

  v_is_system_owner := public.has_role(auth.uid(), 'system_owner'::public.app_role);
  IF v_is_system_owner OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role, 'doctor'::public.app_role, 'nurse'::public.app_role)
  ) THEN
    SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id AND deleted_at IS NULL;
    SELECT * INTO v_account FROM public.patient_portal_accounts WHERE patient_id = p_patient_id;
    IF FOUND AND v_patient.id IS NOT NULL AND v_account.portal_enabled = true AND v_account.status = 'active'
       AND (v_is_system_owner OR public.user_has_branch_access(v_patient.branch_id)) THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'email', v_patient.email,
    'phone', v_patient.phone,
    'patient_name', COALESCE(v_patient.first_name_en, v_patient.first_name_ar, 'Patient'),
    'patient_name_ar', COALESCE(v_patient.first_name_ar, v_patient.first_name_en, 'المريض'),
    'whatsapp_opt_in', COALESCE(v_patient.whatsapp_opt_in, false),
    'branch_id', v_patient.branch_id,
    'support_email', (SELECT s.support_email FROM public.patient_portal_settings s WHERE s.branch_id = v_patient.branch_id LIMIT 1),
    'support_phone', (SELECT s.support_phone FROM public.patient_portal_settings s WHERE s.branch_id = v_patient.branch_id LIMIT 1)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.patient_portal_send_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_send_context(uuid) TO authenticated;

-- Delivery metadata only. Message bodies and temporary passwords are intentionally absent.
CREATE TABLE IF NOT EXISTS public.patient_portal_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  provider_message_id text,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','sent','delivered','read','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_portal_delivery_events_patient_idx
  ON public.patient_portal_delivery_events (patient_id, created_at DESC);
ALTER TABLE public.patient_portal_delivery_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_portal_delivery_events_admin_read ON public.patient_portal_delivery_events;
CREATE POLICY patient_portal_delivery_events_admin_read
ON public.patient_portal_delivery_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.user_has_branch_access(branch_id)
  )
);
DROP TRIGGER IF EXISTS trg_patient_portal_delivery_events_updated ON public.patient_portal_delivery_events;
CREATE TRIGGER trg_patient_portal_delivery_events_updated
BEFORE UPDATE ON public.patient_portal_delivery_events
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- These columns identify the approved Meta template; they do not contain tokens.
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_template_name text,
  ADD COLUMN IF NOT EXISTS meta_template_language text NOT NULL DEFAULT 'ar';

CREATE INDEX IF NOT EXISTS whatsapp_templates_key_active_idx
  ON public.whatsapp_templates (template_key, is_active);
