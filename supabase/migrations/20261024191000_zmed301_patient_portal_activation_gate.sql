-- ZMED-301: the first password is a blocking step, not an optional card.
--
-- An invitation link is single-use and is issued with no password, so a patient who opens it, lands in
-- the portal and ignores the «تأمين الحساب» card can never come back: the link is consumed and
-- login-by-password has no credential to check. `must_change_password` alone did not cover that path,
-- because the mail-safe invitation branch deliberately leaves it false.
--
-- `activated_at` has exactly one writer — patient_portal_complete_password_change() — so
-- `activated_at IS NULL` is the precise definition of "has never set their own password". Deriving the
-- requirement from it also repairs accounts that were invited before this change, with no data write.

CREATE OR REPLACE FUNCTION public.patient_portal_password_state()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account public.patient_portal_accounts%ROWTYPE;
  v_activated boolean;
BEGIN
  SELECT * INTO v_account
  FROM public.patient_portal_accounts
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND OR v_account.portal_enabled IS DISTINCT FROM true OR v_account.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('active', false, 'must_change_password', false, 'activated', false, 'reason', NULL);
  END IF;

  v_activated := v_account.activated_at IS NOT NULL;

  RETURN jsonb_build_object(
    'active', true,
    'must_change_password', v_account.must_change_password OR NOT v_activated,
    'activated', v_activated,
    'reason', CASE
      WHEN NOT v_activated THEN 'first_password_setup'
      WHEN v_account.must_change_password THEN 'admin_reset'
    END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.patient_portal_password_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_password_state() TO authenticated;

-- The screen is only the courteous half of the gate: the RPC is reachable directly with a patient JWT,
-- so the same condition has to stop the data itself. This keeps the deployed body (including its
-- VOLATILE-ness, which records last_seen_at) and replaces only the guard clause.
DO $$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  SELECT pg_get_functiondef('public.patient_portal_snapshot()'::regprocedure) INTO v_before;

  IF position('IF v_account.must_change_password THEN RAISE EXCEPTION' IN v_before) > 0 THEN
    v_definition := replace(
      v_before,
      'IF v_account.must_change_password THEN RAISE EXCEPTION ''patient_portal_password_change_required''; END IF;',
      'IF v_account.must_change_password OR v_account.activated_at IS NULL THEN RAISE EXCEPTION ''patient_portal_password_change_required''; END IF;'
    );
  ELSE
    -- A deployment that never received the 2026-08-26 injection has no guard at all.
    v_definition := replace(
      v_before,
      'IF NOT FOUND THEN RAISE EXCEPTION ''patient_portal_access_denied''; END IF;',
      'IF NOT FOUND THEN RAISE EXCEPTION ''patient_portal_access_denied''; END IF; IF v_account.must_change_password OR v_account.activated_at IS NULL THEN RAISE EXCEPTION ''patient_portal_password_change_required''; END IF;'
    );
  END IF;

  EXECUTE v_definition;

  IF position('v_account.activated_at IS NULL THEN RAISE EXCEPTION ''patient_portal_password_change_required'''
              IN pg_get_functiondef('public.patient_portal_snapshot()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'zmed301: patient_portal_snapshot() guard was not applied';
  END IF;
END;
$$;
