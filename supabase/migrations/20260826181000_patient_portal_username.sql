-- Let a verified patient portal user choose an optional username.
-- The profile is updated only for the patient linked to auth.uid(); no direct
-- profile UPDATE policy is needed for the portal.
CREATE OR REPLACE FUNCTION public.patient_portal_set_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  normalized text := lower(trim(p_username));
  account public.patient_portal_accounts%ROWTYPE;
BEGIN
  IF normalized !~ '^[a-z0-9][a-z0-9._-]{2,31}$' THEN
    RAISE EXCEPTION 'invalid_username';
  END IF;
  SELECT * INTO account FROM public.patient_portal_accounts
   WHERE auth_user_id = auth.uid() AND portal_enabled = true AND status = 'active'
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient_portal_access_denied'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = normalized AND id <> auth.uid()) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;
  UPDATE public.profiles SET username = normalized, updated_at = now() WHERE id = auth.uid();
  RETURN jsonb_build_object('username', normalized);
END;
$$;
REVOKE ALL ON FUNCTION public.patient_portal_set_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_set_username(text) TO authenticated;
