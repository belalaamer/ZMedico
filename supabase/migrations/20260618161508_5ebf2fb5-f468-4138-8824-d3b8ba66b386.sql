-- 1) Lock down SECURITY DEFINER helpers
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- Revoke from authenticated by default, then grant back only what's needed
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- RLS helper functions (called from policies running as the calling role)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_patient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_medical_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_treatment_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_prescription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_treasury(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.realtime_topic_branch_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated;

DO $$
DECLARE r record;
BEGIN
  -- Grant EXECUTE to authenticated on the RPCs the client calls, regardless of signature
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'add_treasury_tx','apply_inventory_tx','apply_coupon_code',
        'receive_po_item','check_expiry_alerts','apply_wallet_tx',
        'fn_treasury_day_cash_summary','fn_resolve_coverage',
        'staff_target_actual','current_user_branch_id',
        'render_template'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;

  -- Re-grant EXECUTE to service_role on every public function (it should always have access)
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2) Tighten reminders insert: remove the always-true policy.
-- The pre-existing branch_isolation ALL policy already gates inserts via user_has_branch_access(branch_id).
DROP POLICY IF EXISTS rem_insert ON public.reminders;

-- 3) invoice_counters: RLS was enabled but had no policy. Lock to admins only.
-- (Trigger writes happen through SECURITY DEFINER number generators, which bypass RLS.)
CREATE POLICY invoice_counters_admin_only
  ON public.invoice_counters
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) product-images bucket: drop the blanket listing policy.
-- Public files remain accessible by URL; staff just can't enumerate the bucket.
DROP POLICY IF EXISTS product_images_authenticated_list ON storage.objects;