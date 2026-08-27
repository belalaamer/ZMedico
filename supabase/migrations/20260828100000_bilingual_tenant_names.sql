-- Bilingual tenant identity with backward-compatible `tenants.name` fallback.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_ar text;

UPDATE public.tenants
SET name_en = COALESCE(NULLIF(trim(name_en), ''), name),
    name_ar = COALESCE(NULLIF(trim(name_ar), ''), name)
WHERE name_en IS NULL OR name_ar IS NULL OR name_en = '' OR name_ar = '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_name_en_length') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_name_en_length CHECK (name_en IS NULL OR char_length(name_en) BETWEEN 1 AND 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_name_ar_length') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_name_ar_length CHECK (name_ar IS NULL OR char_length(name_ar) BETWEEN 1 AND 160);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tenant_subscription_snapshot(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', COALESCE(t.name_en, t.name_ar, t.name),
    'tenant_name_en', t.name_en,
    'tenant_name_ar', t.name_ar,
    'tenant_slug', t.slug,
    'plan_id', COALESCE(t.plan_id, s.plan_id),
    'plan_name_ar', p.name_ar,
    'plan_name_en', p.name_en,
    'plan_features', COALESCE(p.features, '{}'::jsonb),
    'max_branches', p.max_branches,
    'max_staff', p.max_staff,
    'max_patients', p.max_patients,
    'max_invoices_monthly', p.max_invoices_monthly,
    'subscription_status', t.subscription_status::text,
    'billing_cycle', s.billing_cycle::text,
    'trial_ends_at', t.trial_ends_at,
    'subscription_ends_at', t.subscription_ends_at,
    'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end,
    'is_active', t.is_active,
    'access_allowed', public.tenant_has_active_subscription(t.id),
    'access_reason', CASE
      WHEN NOT t.is_active THEN 'tenant_inactive'
      WHEN t.subscription_status IN ('cancelled','expired') THEN 'subscription_expired'
      WHEN t.subscription_status = 'past_due' THEN 'subscription_past_due'
      WHEN t.subscription_status = 'trial' AND (t.trial_ends_at IS NULL OR t.trial_ends_at <= now()) THEN 'trial_expired'
      WHEN t.subscription_status = 'active' AND t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at <= now() THEN 'subscription_expired'
      WHEN COALESCE(t.plan_id, s.plan_id) IS NULL THEN 'plan_required'
      ELSE 'active'
    END
  )
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT sub.* FROM public.subscriptions sub
    WHERE sub.tenant_id = t.id
    ORDER BY sub.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN public.subscription_plans p ON p.id = COALESCE(t.plan_id, s.plan_id)
  WHERE t.id = _tenant_id
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.staff_branches sb
        WHERE sb.user_id = auth.uid()
          AND EXISTS (SELECT 1 FROM public.branches b WHERE b.id = sb.branch_id AND b.tenant_id = t.id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.platform_create_tenant_onboarding(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  IF NOT (public.has_role((select auth.uid()), 'system_owner'::public.app_role) OR public.has_role((select auth.uid()), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'platform onboarding requires administrator access' USING ERRCODE = '42501';
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
$$;

CREATE OR REPLACE FUNCTION public.platform_update_tenant_names(
  p_tenant_id uuid, p_name_en text DEFAULT NULL, p_name_ar text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name_en text := NULLIF(trim(p_name_en), '');
  v_name_ar text := NULLIF(trim(p_name_ar), '');
  v_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501'; END IF;
  IF v_name_en IS NULL AND v_name_ar IS NULL THEN RAISE EXCEPTION 'at least one clinic name is required' USING ERRCODE = '22023'; END IF;
  IF v_name_en IS NOT NULL AND char_length(v_name_en) > 160 THEN RAISE EXCEPTION 'English clinic name is too long' USING ERRCODE = '22023'; END IF;
  IF v_name_ar IS NOT NULL AND char_length(v_name_ar) > 160 THEN RAISE EXCEPTION 'Arabic clinic name is too long' USING ERRCODE = '22023'; END IF;
  v_name_en := COALESCE(v_name_en, v_name_ar);
  v_name_ar := COALESCE(v_name_ar, v_name_en);
  v_name := COALESCE(v_name_en, v_name_ar);
  UPDATE public.tenants SET name = v_name, name_en = v_name_en, name_ar = v_name_ar, updated_at = now() WHERE id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'name', v_name, 'name_en', v_name_en, 'name_ar', v_name_ar);
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_tenant_names(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant_names(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_booking_options_for_tenant(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', COALESCE(t.name_en, t.name_ar, t.name),
    'tenant_name_en', t.name_en,
    'tenant_name_ar', t.name_ar,
    'tenant_slug', t.slug,
    'branches', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name_en', b.name_en, 'name_ar', b.name_ar, 'address', b.address, 'phone', b.phone, 'city', b.city, 'working_hours_start', b.working_hours_start, 'working_hours_end', b.working_hours_end, 'working_days', b.working_days, 'max_future_booking_days', COALESCE(s.max_future_booking_days, 30), 'min_advance_booking_hours', COALESCE(s.min_advance_booking_hours, 1), 'slot_duration_minutes', COALESCE(s.slot_duration_minutes, 30), 'require_confirmation', COALESCE(s.require_confirmation, false)) ORDER BY b.name_en) FROM public.branches b LEFT JOIN public.appointment_settings s ON s.branch_id = b.id WHERE b.tenant_id = t.id AND b.is_active = true AND COALESCE(s.allow_online_booking, true) = true), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name_en', s.name_en, 'name_ar', s.name_ar, 'duration_minutes', s.default_duration_minutes, 'source', 'service') ORDER BY COALESCE(s.display_order, 0), s.name_en) FROM public.services s WHERE s.tenant_id = t.id AND s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true), '[]'::jsonb),
    'procedures', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name_en', p.name_en, 'name_ar', p.name_ar, 'duration_minutes', COALESCE(p.default_duration, 30), 'source', 'procedure') ORDER BY p.name_en) FROM public.procedures p WHERE p.tenant_id = t.id AND p.is_active = true AND p.deleted_at IS NULL), '[]'::jsonb),
    'doctors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name, 'full_name_en', pr.full_name_en, 'full_name_ar', pr.full_name_ar) ORDER BY COALESCE(pr.full_name_en, pr.full_name)) FROM public.profiles pr WHERE EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff_branches sb ON sb.user_id = ur.user_id JOIN public.branches b ON b.id = sb.branch_id WHERE ur.user_id = pr.id AND ur.role = 'doctor'::public.app_role AND b.tenant_id = t.id)), '[]'::jsonb)
  )
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND public.tenant_has_active_subscription(t.id);
$$;

DROP FUNCTION IF EXISTS public.get_public_tenant_branding(text);
CREATE FUNCTION public.get_public_tenant_branding(_hostname text)
RETURNS TABLE(
  tenant_id uuid,
  display_name text,
  tenant_name_en text,
  tenant_name_ar text,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  show_powered_by boolean,
  display_name_source text,
  logo_source text,
  favicon_source text,
  colors_source text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id,
    COALESCE(NULLIF(b.display_name, ''), t.name_en, t.name_ar, t.name),
    t.name_en,
    t.name_ar,
    b.logo_url,
    b.favicon_url,
    COALESCE(b.primary_color, '#3a1a5e'),
    COALESCE(b.secondary_color, '#6d3bb3'),
    COALESCE(b.accent_color, '#d7b86e'),
    COALESCE(b.show_powered_by, true),
    COALESCE(b.display_name_source, 'tenant'),
    COALESCE(b.logo_source, 'tenant'),
    COALESCE(b.favicon_source, 'tenant'),
    COALESCE(b.colors_source, 'tenant')
  FROM public.tenant_domains d
  JOIN public.tenants t ON t.id = d.tenant_id
  LEFT JOIN public.tenant_branding b ON b.tenant_id = t.id
  WHERE d.normalized_hostname = lower(trim(_hostname))
    AND d.status = 'active' AND d.is_enabled = true AND t.is_active = true
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_tenant_branding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_branding(text) TO anon, authenticated;
