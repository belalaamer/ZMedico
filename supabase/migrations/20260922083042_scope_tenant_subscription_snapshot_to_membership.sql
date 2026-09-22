CREATE OR REPLACE FUNCTION public.tenant_subscription_snapshot(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    SELECT sub.*
    FROM public.subscriptions sub
    WHERE sub.tenant_id = t.id
    ORDER BY sub.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN public.subscription_plans p ON p.id = COALESCE(t.plan_id, s.plan_id)
  WHERE t.id = _tenant_id
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.staff_branches sb
        JOIN public.branches b ON b.id = sb.branch_id
        WHERE sb.user_id = auth.uid()
          AND b.tenant_id = t.id
      )
    );
$function$;
