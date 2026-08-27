-- Make plan entitlements authoritative for optional clinic modules while
-- preserving the always-on operational core. Workspace deletion is deliberately
-- implemented as archival/deactivation to preserve clinical records.

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
  v_trial_days integer;
  v_cycle public.billing_cycle;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_plan public.subscription_plans%ROWTYPE;
  v_core_modules constant text[] := ARRAY['dashboard','patients','appointments','medical','invoices','communication'];
  v_allowed_modules constant text[] := ARRAY['dashboard','patients','appointments','medical','invoices','reports','communication','physio','dermatology','orthopedics','dental','inventory','hr','marketing'];
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'system_owner'::public.app_role) OR public.has_role((select auth.uid()), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'platform onboarding requires administrator access' USING ERRCODE = '42501';
  END IF;
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RAISE EXCEPTION 'onboarding payload must be a JSON object' USING ERRCODE = '22023'; END IF;

  v_tenant_name := nullif(trim(payload #>> '{tenant,name}'), '');
  v_slug := lower(nullif(trim(payload #>> '{tenant,slug}'), ''));
  v_billing_email := nullif(trim(payload #>> '{tenant,billing_email}'), '');
  v_plan_id := nullif(payload #>> '{tenant,plan_id}', '')::uuid;
  v_owner_id := (select auth.uid());
  v_trial_days := COALESCE(NULLIF(payload #>> '{subscription,duration_days}', '')::integer, 14);
  v_cycle := COALESCE(NULLIF(payload #>> '{subscription,billing_cycle}', '')::public.billing_cycle, 'monthly'::public.billing_cycle);
  v_branch_name_en := nullif(trim(payload #>> '{branch,name_en}'), '');
  v_branch_name_ar := nullif(trim(payload #>> '{branch,name_ar}'), '');
  v_branch_phone := nullif(trim(payload #>> '{branch,phone}'), '');
  v_branch_address := nullif(trim(payload #>> '{branch,address}'), '');
  v_branch_city := nullif(trim(payload #>> '{branch,city}'), '');
  v_modules := coalesce(payload->'modules', '[]'::jsonb);

  IF v_tenant_name IS NULL OR length(v_tenant_name) > 160 THEN RAISE EXCEPTION 'tenant name is required and must be at most 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'tenant slug is invalid' USING ERRCODE = '22023'; END IF;
  IF v_branch_name_en IS NULL OR length(v_branch_name_en) > 160 THEN RAISE EXCEPTION 'branch English name is required and must be at most 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_branch_name_ar IS NULL OR length(v_branch_name_ar) > 160 THEN v_branch_name_ar := v_branch_name_en; END IF;
  IF v_trial_days < 1 OR v_trial_days > 3650 THEN RAISE EXCEPTION 'subscription duration must be between 1 and 3650 days' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_modules) <> 'array' THEN RAISE EXCEPTION 'modules must be a JSON array' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_modules) requested(module_key) WHERE requested.module_key <> ALL (v_allowed_modules)) THEN RAISE EXCEPTION 'one or more selected modules are not supported' USING ERRCODE = '22023'; END IF;
  IF v_plan_id IS NULL THEN RAISE EXCEPTION 'a subscription plan is required' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_plan_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected subscription plan is not active' USING ERRCODE = '22023'; END IF;

  -- Optional modules must be explicitly included in the selected plan. The
  -- operational core is always provisioned and is not treated as an add-on.
  IF jsonb_object_length(coalesce(v_plan.features, '{}'::jsonb)) > 0 AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_modules) requested(module_key)
    WHERE requested.module_key <> ALL (v_core_modules)
      AND coalesce((v_plan.features ->> requested.module_key)::boolean, false) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'one or more selected modules are not included in the selected plan' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN RAISE EXCEPTION 'tenant slug is already in use' USING ERRCODE = '23505'; END IF;

  INSERT INTO public.tenants (name, slug, owner_id, plan_id, subscription_status, trial_ends_at, billing_email, is_active)
  VALUES (v_tenant_name, v_slug, v_owner_id, v_plan_id, 'trial'::public.subscription_status, now() + make_interval(days => v_trial_days), v_billing_email, true)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.branches (tenant_id, name_en, name_ar, phone, address, city, is_main_branch, is_active)
  VALUES (v_tenant_id, v_branch_name_en, v_branch_name_ar, v_branch_phone, v_branch_address, v_branch_city, true, true)
  RETURNING id INTO v_branch_id;

  INSERT INTO public.tenant_module_settings (tenant_id, module_key, enabled, created_by, updated_by)
  SELECT v_tenant_id, selected.module_key, true, (select auth.uid()), (select auth.uid())
  FROM (
    SELECT DISTINCT module_key
    FROM (SELECT jsonb_array_elements_text(v_modules) AS module_key UNION ALL SELECT unnest(v_core_modules) AS module_key) requested_modules
  ) selected;

  INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
  VALUES (v_tenant_id, v_plan_id, 'trial'::public.subscription_status, v_cycle, now(), now() + make_interval(days => v_trial_days));

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'branch_id', v_branch_id,
    'plan_id', v_plan_id,
    'trial_ends_at', now() + make_interval(days => v_trial_days),
    'modules', (SELECT coalesce(jsonb_agg(module_key ORDER BY module_key), '[]'::jsonb) FROM public.tenant_module_settings WHERE tenant_id = v_tenant_id AND enabled = true)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_delete_subscription_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provisioned_tenant_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;

  SELECT provisioned_tenant_id INTO v_provisioned_tenant_id
  FROM public.subscription_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_provisioned_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Provisioned requests cannot be deleted; close the request and archive the workspace instead' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.subscription_requests WHERE id = p_request_id AND provisioned_tenant_id IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_close_subscription_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.subscription_requests
     SET status = 'closed', reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, auth.uid())
   WHERE id = p_request_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_archive_tenant(p_tenant_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 500);
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002'; END IF;
  IF v_tenant.is_active = false AND v_tenant.subscription_status IN ('cancelled'::public.subscription_status, 'expired'::public.subscription_status) THEN
    RETURN jsonb_build_object('archived', false, 'already_archived', true, 'tenant_id', p_tenant_id);
  END IF;

  UPDATE public.tenants
     SET is_active = false,
         subscription_status = 'cancelled'::public.subscription_status,
         trial_ends_at = CASE WHEN trial_ends_at IS NULL THEN NULL ELSE least(trial_ends_at, now()) END,
         subscription_ends_at = CASE WHEN subscription_ends_at IS NULL THEN now() ELSE least(subscription_ends_at, now()) END,
         updated_at = now()
   WHERE id = p_tenant_id;

  UPDATE public.branches SET is_active = false, updated_at = now() WHERE tenant_id = p_tenant_id;
  UPDATE public.tenant_domains SET is_enabled = false, status = 'disabled', updated_at = now() WHERE tenant_id = p_tenant_id;
  UPDATE public.subscriptions SET status = 'cancelled'::public.subscription_status, current_period_end = least(current_period_end, now()) WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object('archived', true, 'already_archived', false, 'tenant_id', p_tenant_id, 'reason', v_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_delete_subscription_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_close_subscription_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_archive_tenant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_delete_subscription_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_close_subscription_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_archive_tenant(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.platform_archive_tenant(uuid, text) IS
  'System Owner lifecycle action: deactivates a tenant and its branches/domains without deleting clinical records.';
