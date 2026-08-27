-- Provision an approved public trial request into a real tenant workspace.
-- The operation is System Owner-only, atomic, and idempotent per request.

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS provisioned_tenant_id uuid,
  ADD COLUMN IF NOT EXISTS provisioned_branch_id uuid,
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_provisioned_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.subscription_requests
      ADD CONSTRAINT subscription_requests_provisioned_tenant_id_fkey
      FOREIGN KEY (provisioned_tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_provisioned_branch_id_fkey'
  ) THEN
    ALTER TABLE public.subscription_requests
      ADD CONSTRAINT subscription_requests_provisioned_branch_id_fkey
      FOREIGN KEY (provisioned_branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.platform_list_subscription_requests(text);
CREATE FUNCTION public.platform_list_subscription_requests(p_status text DEFAULT 'pending')
RETURNS TABLE(
  id uuid,
  clinic_name text,
  owner_name text,
  email text,
  phone text,
  plan_id uuid,
  plan_name_en text,
  plan_name_ar text,
  message text,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  provisioned_tenant_id uuid,
  provisioned_branch_id uuid,
  provisioned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('all', 'pending', 'contacted', 'approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'Invalid request status' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT r.id, r.clinic_name, r.owner_name, r.email, r.phone, r.plan_id,
         p.name_en, p.name_ar, r.message, r.status, r.notes, r.created_at, r.updated_at,
         r.provisioned_tenant_id, r.provisioned_branch_id, r.provisioned_at
    FROM public.subscription_requests r
    LEFT JOIN public.subscription_plans p ON p.id = r.plan_id
   WHERE p_status IS NULL OR p_status = 'all' OR r.status = p_status
   ORDER BY r.created_at DESC
   LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_approve_subscription_request(
  p_request_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.subscription_requests%ROWTYPE;
  v_plan_id uuid;
  v_features jsonb;
  v_modules jsonb;
  v_slug_base text;
  v_slug text;
  v_onboarding jsonb;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_core_modules constant text[] := ARRAY[
    'dashboard', 'patients', 'appointments', 'medical',
    'invoices', 'reports', 'communication'
  ];
  v_allowed_modules constant text[] := ARRAY[
    'dashboard', 'patients', 'appointments', 'medical',
    'invoices', 'reports', 'communication', 'physio',
    'dermatology', 'orthopedics', 'dental', 'inventory',
    'hr', 'marketing'
  ];
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Notes are too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
    FROM public.subscription_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Retrying approval returns the original provisioning result and never creates duplicates.
  IF v_request.provisioned_tenant_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'created', false,
      'already_provisioned', true,
      'tenant_id', v_request.provisioned_tenant_id,
      'branch_id', v_request.provisioned_branch_id,
      'provisioned_at', v_request.provisioned_at
    );
  END IF;

  IF v_request.status NOT IN ('pending', 'contacted', 'approved') THEN
    RAISE EXCEPTION 'Only pending, contacted, or approved requests can be provisioned' USING ERRCODE = '22023';
  END IF;

  v_plan_id := v_request.plan_id;
  IF v_plan_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.subscription_plans WHERE id = v_plan_id AND is_active = true
  ) THEN
    SELECT id INTO v_plan_id
      FROM public.subscription_plans
     WHERE is_active = true
     ORDER BY display_order, created_at
     LIMIT 1;
  END IF;
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'No active subscription plan is configured' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(features, '{}'::jsonb) INTO v_features
    FROM public.subscription_plans
   WHERE id = v_plan_id;

  SELECT coalesce(jsonb_agg(module_key ORDER BY module_key), '[]'::jsonb)
    INTO v_modules
    FROM (
      SELECT unnest(v_core_modules) AS module_key
      UNION
      SELECT key AS module_key
        FROM jsonb_each_text(v_features)
       WHERE value = 'true' AND key = ANY(v_allowed_modules)
    ) selected_modules;

  v_slug_base := lower(regexp_replace(v_request.clinic_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');
  IF char_length(v_slug_base) < 2 THEN
    v_slug_base := 'clinic';
  END IF;
  v_slug_base := left(v_slug_base, 54);
  v_slug := v_slug_base;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    v_slug := left(v_slug_base, 45) || '-' || left(replace(p_request_id::text, '-', ''), 8);
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Unable to generate a unique tenant slug' USING ERRCODE = '23505';
  END IF;

  v_onboarding := public.platform_create_tenant_onboarding(
    jsonb_build_object(
      'tenant', jsonb_build_object(
        'name', v_request.clinic_name,
        'slug', v_slug,
        'billing_email', v_request.email,
        'plan_id', v_plan_id
      ),
      'branch', jsonb_build_object(
        'name_en', v_request.clinic_name,
        'name_ar', v_request.clinic_name,
        'phone', v_request.phone,
        'address', NULL,
        'city', NULL
      ),
      'modules', v_modules
    )
  );

  v_tenant_id := (v_onboarding->>'tenant_id')::uuid;
  v_branch_id := (v_onboarding->>'branch_id')::uuid;

  UPDATE public.subscription_requests
     SET status = 'approved',
         notes = coalesce(NULLIF(trim(p_notes), ''), notes),
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         provisioned_tenant_id = v_tenant_id,
         provisioned_branch_id = v_branch_id,
         provisioned_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'created', true,
    'already_provisioned', false,
    'tenant_id', v_tenant_id,
    'branch_id', v_branch_id,
    'slug', v_slug,
    'plan_id', v_plan_id,
    'modules', coalesce(v_onboarding->'modules', v_modules)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_subscription_request(
  p_request_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pending', 'contacted', 'approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'Invalid request status' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Notes are too long' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'approved' THEN
    PERFORM public.platform_approve_subscription_request(p_request_id, p_notes);
    RETURN true;
  END IF;

  UPDATE public.subscription_requests
     SET status = p_status,
         notes = NULLIF(trim(coalesce(p_notes, '')), ''),
         reviewed_at = CASE WHEN p_status IN ('rejected', 'closed') THEN now() ELSE reviewed_at END,
         reviewed_by = CASE WHEN p_status IN ('rejected', 'closed') THEN auth.uid() ELSE reviewed_by END
   WHERE id = p_request_id
     AND provisioned_tenant_id IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_subscription_requests(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_approve_subscription_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_update_subscription_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_list_subscription_requests(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_approve_subscription_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_subscription_request(uuid, text, text) TO authenticated;
