-- Comprehensive RLS hardening for cross-tenant isolation.
-- No data mutation or deletion. Restrictive policies compose with existing
-- role/permission policies and prevent a permissive policy from bypassing scope.

-- Core branch-scoped operational tables. System Owner remains global.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments','patients','invoices','payments','medical_records',
    'physio_cases','leads','attendance',
    'payroll','work_schedules','staff_targets',
    'staff_profiles','staff_branches'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_hardening_branch_scope ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY rls_hardening_branch_scope ON public.%I AS RESTRICTIVE FOR ALL TO public USING (has_role(auth.uid(), ''system_owner''::app_role) OR (branch_id IS NOT NULL AND user_has_branch_access(branch_id))) WITH CHECK (has_role(auth.uid(), ''system_owner''::app_role) OR (branch_id IS NOT NULL AND user_has_branch_access(branch_id)))',
      t
    );
  END LOOP;
END $$;

-- HR rows inherit scope from the staff profile or payroll parent.
DROP POLICY IF EXISTS rls_hardening_leave_requests_scope ON public.leave_requests;
CREATE POLICY rls_hardening_leave_requests_scope
  ON public.leave_requests AS RESTRICTIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = leave_requests.staff_id
        AND sp.branch_id IS NOT NULL
        AND user_has_branch_access(sp.branch_id)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = leave_requests.staff_id
        AND sp.branch_id IS NOT NULL
        AND user_has_branch_access(sp.branch_id)
    )
  );

DROP POLICY IF EXISTS rls_hardening_performance_reviews_scope ON public.performance_reviews;
CREATE POLICY rls_hardening_performance_reviews_scope
  ON public.performance_reviews AS RESTRICTIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = performance_reviews.staff_id
        AND sp.branch_id IS NOT NULL
        AND user_has_branch_access(sp.branch_id)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = performance_reviews.staff_id
        AND sp.branch_id IS NOT NULL
        AND user_has_branch_access(sp.branch_id)
    )
  );

DROP POLICY IF EXISTS rls_hardening_salary_adjustments_scope ON public.salary_adjustments;
CREATE POLICY rls_hardening_salary_adjustments_scope
  ON public.salary_adjustments AS RESTRICTIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.payroll p
      WHERE p.id = salary_adjustments.payroll_id
        AND p.branch_id IS NOT NULL
        AND user_has_branch_access(p.branch_id)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.payroll p
      WHERE p.id = salary_adjustments.payroll_id
        AND p.branch_id IS NOT NULL
        AND user_has_branch_access(p.branch_id)
    )
  );

-- Branch-aware reference/config tables. NULL branch rows are shared defaults;
-- branch-specific rows are visible only to the owning branch (or System Owner).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointment_settings','departments','expense_categories',
    'invoice_settings','payment_methods'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_hardening_branch_or_default ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY rls_hardening_branch_or_default ON public.%I AS RESTRICTIVE FOR ALL TO public USING (has_role(auth.uid(), ''system_owner''::app_role) OR branch_id IS NULL OR user_has_branch_access(branch_id)) WITH CHECK (has_role(auth.uid(), ''system_owner''::app_role) OR branch_id IS NULL OR user_has_branch_access(branch_id))',
      t
    );
  END LOOP;
END $$;

-- Child records must inherit scope from their parent record.
DROP POLICY IF EXISTS rls_hardening_service_consumables ON public.service_consumables;
CREATE POLICY rls_hardening_service_consumables
  ON public.service_consumables AS RESTRICTIVE FOR ALL TO public
  USING (
    (service_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_consumables.service_id
        AND user_has_tenant_access(s.tenant_id)
    ))
    OR
    (procedure_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.procedures p
      WHERE p.id = service_consumables.procedure_id
        AND user_has_tenant_access(p.tenant_id)
    ))
  )
  WITH CHECK (
    (service_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_consumables.service_id
        AND user_has_tenant_access(s.tenant_id)
    ))
    OR
    (procedure_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.procedures p
      WHERE p.id = service_consumables.procedure_id
        AND user_has_tenant_access(p.tenant_id)
    ))
  );

-- These internal authorization/shadow tables are Platform-only. Runtime
-- authorization uses SECURITY DEFINER helpers, not direct client reads.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'authz_bundle_implies','authz_bundle_permissions','authz_bundles',
    'authz_permissions','authz_role_bundles','authz_shadow_decisions',
    'authz_shadow_expected_expansions','authz_shadow_slice_gate',
    'role_permissions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_hardening_platform_authz ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY rls_hardening_platform_authz ON public.%I AS RESTRICTIVE FOR ALL TO public USING (has_role(auth.uid(), ''system_owner''::app_role)) WITH CHECK (has_role(auth.uid(), ''system_owner''::app_role))',
      t
    );
  END LOOP;
END $$;

-- Protect provider credentials at the column-privilege layer. The safe view
-- and upsert RPC remain the supported client paths.
REVOKE SELECT (
  whatsapp_api_key, sms_api_key, twilio_auth_token,
  smsmisr_password, smsmisr_sender_token
) ON public.notification_settings FROM anon, authenticated;

GRANT SELECT (
  id, branch_id, send_appointment_reminders, reminder_channel,
  send_appointment_confirmation, send_appointment_cancellation,
  send_invoice_notification, send_payment_receipt, send_birthday_greeting,
  birthday_discount_percentage, send_follow_up_reminder, follow_up_days_after,
  email_sender_name, email_sender_address, sms_sender_id,
  whatsapp_business_number, created_at, updated_at, whatsapp_api_url,
  sms_api_url, whatsapp_enabled, sms_enabled, whatsapp_provider, sms_provider,
  meta_phone_number_id, twilio_account_sid, twilio_from_whatsapp,
  twilio_from_sms, winback_enabled, winback_inactive_days,
  smsmisr_environment, smsmisr_language
) ON public.notification_settings TO authenticated;

-- Counters are implementation details; clients should use server-side RPCs.
REVOKE SELECT ON public.employee_id_counter, public.po_counters,
  public.product_sku_counter FROM anon, authenticated;

COMMENT ON POLICY rls_hardening_branch_scope ON public.patients IS
  'Defense-in-depth tenant/branch isolation; System Owner is global.';
COMMENT ON POLICY rls_hardening_platform_authz ON public.role_permissions IS
  'Authorization internals are Platform-only; runtime reads use definer helpers.';
COMMENT ON COLUMN public.notification_settings.whatsapp_api_key IS
  'Provider credential; never expose through client table reads.';
COMMENT ON COLUMN public.notification_settings.sms_api_key IS
  'Provider credential; never expose through client table reads.';
COMMENT ON COLUMN public.notification_settings.twilio_auth_token IS
  'Provider credential; never expose through client table reads.';
COMMENT ON COLUMN public.notification_settings.smsmisr_password IS
  'Provider credential; never expose through client table reads.';
COMMENT ON COLUMN public.notification_settings.smsmisr_sender_token IS
  'Provider credential; never expose through client table reads.';
-- Coupons are shared defaults or branch-specific; never resolve a coupon from
-- another branch through the SECURITY DEFINER validation RPC.
DROP POLICY IF EXISTS rls_hardening_coupon_scope ON public.coupons;
CREATE POLICY rls_hardening_coupon_scope
  ON public.coupons AS RESTRICTIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR branch_id IS NULL
    OR user_has_branch_access(branch_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR branch_id IS NULL
    OR user_has_branch_access(branch_id)
  );

CREATE OR REPLACE FUNCTION public.apply_coupon_code(_code text, _subtotal numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  disc numeric(14,2) := 0;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'invoices.coupon.apply') THEN
    RAISE EXCEPTION 'Forbidden: missing permission invoices.coupon.apply';
  END IF;

  SELECT * INTO c
    FROM public.coupons
   WHERE upper(code) = upper(_code)
     AND (
       branch_id IS NULL
       OR public.has_role(v_actor, 'system_owner'::app_role)
       OR public.user_has_branch_access(branch_id)
     )
   ORDER BY (branch_id IS NULL) ASC, created_at DESC
   LIMIT 1;
  IF c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error','not_found'); END IF;
  IF NOT c.is_active THEN RETURN jsonb_build_object('ok', false, 'error','disabled'); END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > current_date THEN RETURN jsonb_build_object('ok', false, 'error','not_started'); END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at < current_date THEN RETURN jsonb_build_object('ok', false, 'error','expired'); END IF;
  IF c.usage_limit IS NOT NULL AND c.usage_count >= c.usage_limit THEN RETURN jsonb_build_object('ok', false, 'error','limit_reached'); END IF;
  IF COALESCE(c.min_order_amount,0) > _subtotal THEN
    RETURN jsonb_build_object('ok', false, 'error','min_order', 'min', c.min_order_amount);
  END IF;

  IF c.discount_type = 'percent' THEN
    disc := round(_subtotal * c.discount_value / 100, 2);
  ELSE
    disc := c.discount_value;
  END IF;
  IF c.max_discount_amount IS NOT NULL AND disc > c.max_discount_amount THEN
    disc := c.max_discount_amount;
  END IF;
  IF disc > _subtotal THEN disc := _subtotal; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_amount', disc
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_coupon_code(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_coupon_code(text, numeric) TO authenticated;

-- Prevent direct reads of the platform-wide authorization shadow data by
-- clinic roles; SECURITY DEFINER runtime helpers remain available.
REVOKE ALL ON TABLE public.authz_versions FROM anon, authenticated;
GRANT SELECT ON TABLE public.authz_versions TO authenticated;
DROP POLICY IF EXISTS authz_versions_read_authenticated ON public.authz_versions;
CREATE POLICY authz_versions_read_authenticated
  ON public.authz_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role));

REVOKE ALL ON TABLE public.employee_id_counter, public.po_counters,
  public.product_sku_counter FROM anon, authenticated;
