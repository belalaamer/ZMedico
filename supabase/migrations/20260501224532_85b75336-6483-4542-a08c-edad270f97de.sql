-- Clear demo/transactional data while preserving schema, config, and admin user.
-- Use TRUNCATE ... CASCADE on tables that exist; missing tables are skipped.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'audit_logs',
    'user_activity_logs',
    'stock_alerts',
    'inventory_transactions',
    'inventory',
    'purchase_order_items',
    'purchase_orders',
    'treasury_transactions',
    'expenses',
    'payments',
    'invoice_items',
    'invoices',
    'claim_items',
    'insurance_claims',
    'insurance_pre_authorizations',
    'patient_insurance',
    'prescription_items',
    'prescriptions',
    'record_procedures',
    'record_diagnoses',
    'vital_signs',
    'medical_records',
    'dental_chart',
    'medical_history',
    'patient_documents',
    'appointments',
    'patients',
    'salary_adjustments',
    'payroll',
    'leave_requests',
    'attendance',
    'work_schedules',
    'staff_profiles',
    'saved_reports',
    'report_schedules'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Reset known counters/sequences to 1
UPDATE public.invoice_counters SET last_value = 0;
UPDATE public.po_counters SET last_value = 0;
UPDATE public.employee_id_counter SET last_value = 0 WHERE id = 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='product_sku_counter') THEN
    EXECUTE 'UPDATE public.product_sku_counter SET last_value = 0 WHERE id = 1';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname='public' AND sequencename='patient_code_seq') THEN
    EXECUTE 'ALTER SEQUENCE public.patient_code_seq RESTART WITH 1';
  END IF;
END $$;