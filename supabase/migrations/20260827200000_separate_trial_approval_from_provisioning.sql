-- Separate approving a free-trial request from provisioning its workspace.
-- Approval is a reversible workflow state; provisioning is an explicit second action
-- that receives the reviewed onboarding payload.

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

  IF v_request.provisioned_tenant_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'approved', true,
      'ready_for_provisioning', false,
      'created', false,
      'already_provisioned', true,
      'tenant_id', v_request.provisioned_tenant_id,
      'branch_id', v_request.provisioned_branch_id,
      'provisioned_at', v_request.provisioned_at
    );
  END IF;

  IF v_request.status NOT IN ('pending', 'contacted', 'approved') THEN
    RAISE EXCEPTION 'Only pending, contacted, or approved requests can be approved' USING ERRCODE = '22023';
  END IF;

  UPDATE public.subscription_requests
     SET status = 'approved',
         notes = coalesce(NULLIF(trim(p_notes), ''), notes),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'approved', true,
    'ready_for_provisioning', true,
    'created', false,
    'already_provisioned', false,
    'request_id', p_request_id,
    'plan_id', v_request.plan_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_provision_approved_subscription_request(
  p_request_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
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
  v_tenant_name text;
  v_slug text;
  v_billing_email text;
  v_branch_name_en text;
  v_branch_name_ar text;
  v_phone text;
  v_city text;
  v_address text;
  v_trial_days integer;
  v_billing_cycle text;
  v_modules jsonb;
  v_onboarding jsonb;
  v_slug_base text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Provisioning payload must be a JSON object' USING ERRCODE = '22023';
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

  IF v_request.provisioned_tenant_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'created', false,
      'already_provisioned', true,
      'tenant_id', v_request.provisioned_tenant_id,
      'branch_id', v_request.provisioned_branch_id,
      'provisioned_at', v_request.provisioned_at
    );
  END IF;
  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'The request must be approved before provisioning' USING ERRCODE = '22023';
  END IF;

  v_tenant_name := coalesce(nullif(trim(p_payload #>> '{tenant,name}'), ''), v_request.clinic_name);
  v_billing_email := coalesce(nullif(trim(p_payload #>> '{tenant,billing_email}'), ''), v_request.email);
  v_plan_id := coalesce(nullif(p_payload #>> '{tenant,plan_id}', '')::uuid, v_request.plan_id);
  v_branch_name_en := coalesce(nullif(trim(p_payload #>> '{branch,name_en}'), ''), v_request.clinic_name);
  v_branch_name_ar := coalesce(nullif(trim(p_payload #>> '{branch,name_ar}'), ''), v_branch_name_en);
  v_phone := coalesce(nullif(trim(p_payload #>> '{branch,phone}'), ''), v_request.phone);
  v_city := nullif(trim(p_payload #>> '{branch,city}'), '');
  v_address := nullif(trim(p_payload #>> '{branch,address}'), '');
  v_trial_days := coalesce(nullif(p_payload #>> '{subscription,duration_days}', '')::integer, 14);
  v_billing_cycle := coalesce(nullif(p_payload #>> '{subscription,billing_cycle}', ''), 'monthly');
  v_modules := coalesce(p_payload->'modules', '[]'::jsonb);

  IF v_tenant_name IS NULL OR length(v_tenant_name) > 160 THEN
    RAISE EXCEPTION 'Tenant name is required and must be at most 160 characters' USING ERRCODE = '22023';
  END IF;
  IF v_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = v_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Selected subscription plan is not active' USING ERRCODE = '22023';
  END IF;
  IF v_trial_days < 1 OR v_trial_days > 3650 THEN
    RAISE EXCEPTION 'Subscription duration must be between 1 and 3650 days' USING ERRCODE = '22023';
  END IF;
  IF v_billing_cycle NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Billing cycle must be monthly or yearly' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_modules) <> 'array' THEN
    RAISE EXCEPTION 'Modules must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_slug := lower(nullif(trim(p_payload #>> '{tenant,slug}'), ''));
  IF v_slug IS NULL THEN
    v_slug_base := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');
    IF char_length(v_slug_base) < 2 THEN v_slug_base := 'clinic'; END IF;
    v_slug := left(v_slug_base, 54);
    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
      v_slug := left(v_slug_base, 45) || '-' || left(replace(p_request_id::text, '-', ''), 8);
    END IF;
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN
    RAISE EXCEPTION 'Tenant slug is invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Tenant slug is already in use' USING ERRCODE = '23505';
  END IF;

  v_onboarding := public.platform_create_tenant_onboarding(
    jsonb_build_object(
      'tenant', jsonb_build_object(
        'name', v_tenant_name,
        'slug', v_slug,
        'billing_email', v_billing_email,
        'plan_id', v_plan_id
      ),
      'subscription', jsonb_build_object(
        'duration_days', v_trial_days,
        'billing_cycle', v_billing_cycle
      ),
      'branch', jsonb_build_object(
        'name_en', v_branch_name_en,
        'name_ar', v_branch_name_ar,
        'phone', v_phone,
        'address', v_address,
        'city', v_city
      ),
      'modules', v_modules
    )
  );

  UPDATE public.subscription_requests
     SET status = 'approved',
         notes = coalesce(NULLIF(trim(p_notes), ''), notes),
         reviewed_at = coalesce(reviewed_at, now()),
         reviewed_by = coalesce(reviewed_by, auth.uid()),
         provisioned_tenant_id = (v_onboarding->>'tenant_id')::uuid,
         provisioned_branch_id = (v_onboarding->>'branch_id')::uuid,
         provisioned_at = now()
   WHERE id = p_request_id;

  RETURN v_onboarding || jsonb_build_object(
    'created', true,
    'already_provisioned', false,
    'request_id', p_request_id,
    'slug', v_slug
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

REVOKE ALL ON FUNCTION public.platform_provision_approved_subscription_request(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_provision_approved_subscription_request(uuid, jsonb, text) TO authenticated;
