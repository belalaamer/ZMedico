-- ZMedico platform onboarding: create a tenant, its first branch, and module entitlements atomically.
-- The function is intentionally exposed only to authenticated callers and performs
-- its own System Owner/Admin check. All statements in a PL/pgSQL function run in
-- one transaction; any exception rolls back the complete onboarding operation.

CREATE OR REPLACE FUNCTION public.platform_create_tenant_onboarding(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_name text;
  v_slug text;
  v_billing_email text;
  v_plan_id uuid;
  v_owner_id uuid;
  v_branch_name_en text;
  v_branch_name_ar text;
  v_branch_phone text;
  v_branch_address text;
  v_branch_city text;
  v_modules jsonb;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_plan public.subscription_plans%ROWTYPE;
  v_module_key text;
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
  IF NOT (
    public.has_role((select auth.uid()), 'system_owner'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'platform onboarding requires administrator access'
      USING ERRCODE = '42501';
  END IF;

  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'onboarding payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  v_tenant_name := nullif(trim(payload #>> '{tenant,name}'), '');
  v_slug := lower(nullif(trim(payload #>> '{tenant,slug}'), ''));
  v_billing_email := nullif(trim(payload #>> '{tenant,billing_email}'), '');
  v_plan_id := nullif(payload #>> '{tenant,plan_id}', '')::uuid;
  -- The caller is the audit/creator identity. Do not trust an owner_id sent by the browser.
  v_owner_id := (select auth.uid());

  v_branch_name_en := nullif(trim(payload #>> '{branch,name_en}'), '');
  v_branch_name_ar := nullif(trim(payload #>> '{branch,name_ar}'), '');
  v_branch_phone := nullif(trim(payload #>> '{branch,phone}'), '');
  v_branch_address := nullif(trim(payload #>> '{branch,address}'), '');
  v_branch_city := nullif(trim(payload #>> '{branch,city}'), '');
  v_modules := coalesce(payload->'modules', '[]'::jsonb);

  IF v_tenant_name IS NULL OR length(v_tenant_name) > 160 THEN
    RAISE EXCEPTION 'tenant name is required and must be at most 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN
    RAISE EXCEPTION 'tenant slug is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_branch_name_en IS NULL OR length(v_branch_name_en) > 160 THEN
    RAISE EXCEPTION 'branch English name is required and must be at most 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_branch_name_ar IS NULL OR length(v_branch_name_ar) > 160 THEN
    v_branch_name_ar := v_branch_name_en;
  END IF;

  IF jsonb_typeof(v_modules) <> 'array' THEN
    RAISE EXCEPTION 'modules must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_modules) AS requested(module_key)
    WHERE requested.module_key <> ALL (v_allowed_modules)
  ) THEN
    RAISE EXCEPTION 'one or more selected modules are not supported'
      USING ERRCODE = '22023';
  END IF;

  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE id = v_plan_id AND is_active = true
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'selected subscription plan is not active'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'tenant slug is already in use'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tenants (
    name, slug, owner_id, plan_id, subscription_status,
    trial_ends_at, billing_email, is_active
  )
  VALUES (
    v_tenant_name,
    v_slug,
    v_owner_id,
    v_plan_id,
    'trial'::public.subscription_status,
    CASE WHEN v_plan_id IS NULL THEN NULL ELSE now() + interval '14 days' END,
    v_billing_email,
    true
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.branches (
    tenant_id, name_en, name_ar, phone, address, city,
    is_main_branch, is_active
  )
  VALUES (
    v_tenant_id,
    v_branch_name_en,
    v_branch_name_ar,
    v_branch_phone,
    v_branch_address,
    v_branch_city,
    true,
    true
  )
  RETURNING id INTO v_branch_id;

  INSERT INTO public.tenant_module_settings (
    tenant_id, module_key, enabled, created_by, updated_by
  )
  SELECT
    v_tenant_id,
    selected.module_key,
    true,
    (select auth.uid()),
    (select auth.uid())
  FROM (
    SELECT DISTINCT module_key
    FROM (
      SELECT jsonb_array_elements_text(v_modules) AS module_key
      UNION ALL
      SELECT unnest(v_core_modules) AS module_key
    ) requested_modules
  ) selected;

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      tenant_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end
    )
    VALUES (
      v_tenant_id,
      v_plan_id,
      'trial'::public.subscription_status,
      'monthly'::public.billing_cycle,
      now(),
      now() + interval '14 days'
    );
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'branch_id', v_branch_id,
    'plan_id', v_plan_id,
    'modules', (
      SELECT coalesce(jsonb_agg(module_key ORDER BY module_key), '[]'::jsonb)
      FROM public.tenant_module_settings
      WHERE tenant_id = v_tenant_id AND enabled = true
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_tenant_onboarding(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_create_tenant_onboarding(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant_onboarding(jsonb) TO authenticated;
