
-- 1. Revoke EXECUTE from public + authenticated on internal-only SECURITY DEFINER functions
--    (trigger functions and internal helpers that must never be called via RPC).
DO $$
DECLARE
  fn record;
  names text[] := ARRAY[
    '_audit_write',
    '_get_cron_secret',
    '_set_cron_secret',
    '_tg_expense_period_guard',
    '_treasury_assert_open_period',
    'audit_treasury_daily_closes_v2',
    'audit_treasury_tx_v2',
    'enqueue_appointment_reminders',
    'expense_treasury_self_audit',
    'fn_consume_for_invoice',
    'fn_treasury_day_cash_summary',
    'generate_employee_id',
    'generate_invoice_number',
    'generate_po_number',
    'generate_product_sku',
    'generate_saas_invoice_number',
    'handle_new_user',
    'recalc_commissions_for_invoice',
    'recalc_invoice_payments',
    'recalc_invoice_subtotal',
    'recalc_po_subtotal',
    'tg_audit_physio_cases',
    'tg_audit_physio_child',
    'tg_audit_role_permissions',
    'tg_audit_staff_sensitive',
    'tg_audit_user_roles',
    'tg_performance_review_self_update_guard'
  ];
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY(names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', fn.proname, fn.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',       fn.proname, fn.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', fn.proname, fn.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn.proname, fn.args);
  END LOOP;
END $$;

-- 2. Tighten staff_profiles self-access: match by linked_user_id only.
--    Previously "id = auth.uid()" was a legacy escape hatch; removing it
--    closes the linked_user_id/id mismatch attack path.
DROP POLICY IF EXISTS staff_select_self_or_admin ON public.staff_profiles;
DROP POLICY IF EXISTS staff_update_self          ON public.staff_profiles;

CREATE POLICY staff_select_self
  ON public.staff_profiles
  FOR SELECT
  TO authenticated
  USING (linked_user_id = auth.uid());

CREATE POLICY staff_update_self
  ON public.staff_profiles
  FOR UPDATE
  TO authenticated
  USING (linked_user_id = auth.uid())
  WITH CHECK (linked_user_id = auth.uid());

-- 3. Enforce one-staff-profile-per-user so linked_user_id cannot alias
--    another user's row. Partial unique index skips NULL (unlinked staff).
CREATE UNIQUE INDEX IF NOT EXISTS staff_profiles_linked_user_id_uniq
  ON public.staff_profiles(linked_user_id)
  WHERE linked_user_id IS NOT NULL;
