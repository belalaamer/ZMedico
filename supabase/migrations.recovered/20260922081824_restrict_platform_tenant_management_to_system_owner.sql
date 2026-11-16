-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260922081824
-- name: restrict_platform_tenant_management_to_system_owner
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.


CREATE OR REPLACE FUNCTION public.platform_create_tenant_onboarding(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_name text;
  v_tenant_name_en text;
  v_tenant_name_ar text;
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
  v_core_modules constant text[] := ARRAY['dashboard','patients','appointments','medical','invoices','reports','communication'];
  v_allowed_modules constant text[] := ARRAY['dashboard','patients','appointments','medical','invoices','reports','communication','physio','dermatology','orthopedics','dental','inventory','hr','marketing'];
BEGIN
  IF NOT public.has_role((select auth.uid()), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'platform onboarding requires System Owner access' USING ERRCODE = '42501';
  END IF;

  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RAISE EXCEPTION 'onboarding payload must be a JSON object' USING ERRCODE = '22023'; END IF;

  v_tenant_name_en := nullif(trim(payload #>> '{tenant,name_en}'), '');
  v_tenant_name_ar := nullif(trim(payload #>> '{tenant,name_ar}'), '');
  v_tenant_name := nullif(trim(payload #>> '{tenant,name}'), '');
  v_tenant_name_en := COALESCE(v_tenant_name_en, v_tenant_name);
  v_tenant_name_ar := COALESCE(v_tenant_name_ar, v_tenant_name);
  v_tenant_name := COALESCE(v_tenant_name_en, v_tenant_name_ar);
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
  IF v_tenant_name_en IS NOT NULL AND length(v_tenant_name_en) > 160 THEN RAISE EXCEPTION 'tenant English name must be at most 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_tenant_name_ar IS NOT NULL AND length(v_tenant_name_ar) > 160 THEN RAISE EXCEPTION 'tenant Arabic name must be at most 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_tenant_name_en IS NULL THEN v_tenant_name_en := v_tenant_name_ar; END IF;
  IF v_tenant_name_ar IS NULL THEN v_tenant_name_ar := v_tenant_name_en; END IF;
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'tenant slug is invalid' USING ERRCODE = '22023'; END IF;
  IF v_branch_name_en IS NULL OR length(v_branch_name_en) > 160 THEN RAISE EXCEPTION 'branch English name is required and must be at most 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_branch_name_ar IS NULL OR length(v_branch_name_ar) > 160 THEN v_branch_name_ar := v_branch_name_en; END IF;
  IF v_trial_days < 1 OR v_trial_days > 3650 THEN RAISE EXCEPTION 'subscription duration must be between 1 and 3650 days' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_modules) <> 'array' THEN RAISE EXCEPTION 'modules must be a JSON array' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_modules) requested(module_key) WHERE requested.module_key <> ALL (v_allowed_modules)) THEN RAISE EXCEPTION 'one or more selected modules are not supported' USING ERRCODE = '22023'; END IF;
  IF v_plan_id IS NULL THEN RAISE EXCEPTION 'a subscription plan is required' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_plan_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected subscription plan is not active' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN RAISE EXCEPTION 'tenant slug is already in use' USING ERRCODE = '23505'; END IF;

  INSERT INTO public.tenants (name, name_en, name_ar, slug, owner_id, plan_id, subscription_status, trial_ends_at, billing_email, is_active)
  VALUES (v_tenant_name, v_tenant_name_en, v_tenant_name_ar, v_slug, v_owner_id, v_plan_id, 'trial'::public.subscription_status, now() + make_interval(days => v_trial_days), v_billing_email, true)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.branches (tenant_id, name_en, name_ar, phone, address, city, is_main_branch, is_active)
  VALUES (v_tenant_id, v_branch_name_en, v_branch_name_ar, v_branch_phone, v_branch_address, v_branch_city, true, true)
  RETURNING id INTO v_branch_id;

  INSERT INTO public.tenant_module_settings (tenant_id, module_key, enabled, created_by, updated_by)
  SELECT v_tenant_id, selected.module_key, true, (select auth.uid()), (select auth.uid())
  FROM (SELECT DISTINCT module_key FROM (SELECT jsonb_array_elements_text(v_modules) AS module_key UNION ALL SELECT unnest(v_core_modules) AS module_key) requested_modules) selected;

  INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
  VALUES (v_tenant_id, v_plan_id, 'trial'::public.subscription_status, v_cycle, now(), now() + make_interval(days => v_trial_days));

  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'branch_id', v_branch_id, 'plan_id', v_plan_id, 'trial_ends_at', now() + make_interval(days => v_trial_days), 'modules', (SELECT coalesce(jsonb_agg(module_key ORDER BY module_key), '[]'::jsonb) FROM public.tenant_module_settings WHERE tenant_id = v_tenant_id AND enabled = true));
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_tenant_subscription(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_plan_id uuid;
  v_status public.subscription_status;
  v_cycle public.billing_cycle;
  v_duration_days integer;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_tenant public.tenants%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_subscription_id uuid;
  v_previous_plan uuid;
  v_previous_status public.subscription_status;
  v_previous_period_end timestamptz;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'platform subscription management requires System Owner access'
      USING ERRCODE = '42501';
  END IF;

  v_tenant_id := nullif(payload #>> '{tenant_id}', '')::uuid;
  v_plan_id := nullif(payload #>> '{plan_id}', '')::uuid;
  v_status := COALESCE(NULLIF(payload #>> '{status}', '')::public.subscription_status, 'active'::public.subscription_status);
  v_cycle := COALESCE(NULLIF(payload #>> '{billing_cycle}', '')::public.billing_cycle, 'monthly'::public.billing_cycle);
  v_duration_days := COALESCE(NULLIF(payload #>> '{duration_days}', '')::integer, CASE WHEN v_cycle = 'yearly' THEN 365 ELSE 30 END);

  IF v_tenant_id IS NULL OR v_plan_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id and plan_id are required' USING ERRCODE = '22023';
  END IF;
  IF v_duration_days < 1 OR v_duration_days > 3650 THEN
    RAISE EXCEPTION 'duration_days must be between 1 and 3650' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_plan_id AND is_active = true
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected subscription plan is not active' USING ERRCODE = '22023'; END IF;

  SELECT id, plan_id, status, current_period_end
    INTO v_subscription_id, v_previous_plan, v_previous_status, v_previous_period_end
  FROM public.subscriptions
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_period_end := COALESCE(NULLIF(payload #>> '{period_end}', '')::timestamptz, now() + make_interval(days => v_duration_days));
  IF v_status IN ('active','trial') AND v_period_end <= now() THEN
    RAISE EXCEPTION 'period_end must be in the future' USING ERRCODE = '22023';
  END IF;

  IF v_status = 'trial' THEN
    v_trial_end := v_period_end;
  ELSE
    v_trial_end := NULL;
  END IF;

  IF v_subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (
      tenant_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end
    ) VALUES (
      v_tenant_id, v_plan_id, v_status, v_cycle,
      now(), v_period_end
    ) RETURNING id INTO v_subscription_id;
  ELSE
    UPDATE public.subscriptions
    SET plan_id = v_plan_id,
        status = v_status,
        billing_cycle = v_cycle,
        current_period_start = now(),
        current_period_end = v_period_end,
        cancelled_at = CASE WHEN v_status = 'cancelled' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = v_subscription_id;
  END IF;

  UPDATE public.tenants
  SET plan_id = v_plan_id,
      subscription_status = v_status,
      trial_ends_at = v_trial_end,
      subscription_ends_at = CASE WHEN v_status = 'active' THEN v_period_end ELSE NULL END,
      is_active = CASE WHEN v_status IN ('cancelled','expired') THEN false ELSE true END,
      updated_at = now()
  WHERE id = v_tenant_id;

  INSERT INTO public.subscription_change_log (
    tenant_id, actor_id, previous_plan_id, new_plan_id,
    previous_status, new_status, previous_period_end, new_period_end, reason
  ) VALUES (
    v_tenant_id, auth.uid(), v_previous_plan, v_plan_id,
    v_previous_status, v_status, v_previous_period_end, v_period_end,
    NULLIF(trim(payload #>> '{reason}'), '')
  );

  RETURN public.tenant_subscription_snapshot(v_tenant_id);
END;
$function$;

