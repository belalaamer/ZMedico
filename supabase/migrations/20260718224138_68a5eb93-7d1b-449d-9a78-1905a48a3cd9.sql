
CREATE OR REPLACE FUNCTION public.admin_force_delete_branch(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'appointment_settings','appointments','attendance','audit_export_presets','audit_logs',
    'clinic_profile','clinic_settings','communication_templates','coupon_redemptions','coupons',
    'departments','doctor_commissions','expense_categories','expenses','inventory','inventory_transactions',
    'invoice_settings','invoices','medical_records','notification_settings','patient_wallet_transactions',
    'patients','payment_methods','payments','payroll','physio_cases','purchase_orders','queue_alert_runs',
    'queue_alerts','queue_settings','reminders','staff_branches','staff_profiles','staff_targets',
    'stock_alerts','treasury','treasury_daily_closes','treatment_plans','work_schedules'
  ];
  branch_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::app_role) THEN
    RAISE EXCEPTION 'Only system owners may force-delete branches';
  END IF;

  SELECT count(*) INTO branch_count FROM public.branches;
  IF branch_count <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the last remaining branch';
  END IF;

  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE branch_id = $1', tbl) USING _branch_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      -- table/column missing in this environment, skip
      NULL;
    END;
  END LOOP;

  DELETE FROM public.branches WHERE id = _branch_id;
  RETURN jsonb_build_object('success', true, 'branch_id', _branch_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_delete_branch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_branch(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_archive_branch(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'system_owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized to archive branches';
  END IF;

  UPDATE public.branches
     SET is_active = false,
         is_main_branch = false,
         updated_at = now()
   WHERE id = _branch_id;

  RETURN jsonb_build_object('success', true, 'branch_id', _branch_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_branch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_archive_branch(uuid) TO authenticated;
