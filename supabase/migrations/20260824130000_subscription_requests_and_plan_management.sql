-- Public subscription requests are manual-sales leads, not automatic account creation.
CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name text NOT NULL CHECK (char_length(trim(clinic_name)) BETWEEN 2 AND 120),
  owner_name text NOT NULL CHECK (char_length(trim(owner_name)) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (char_length(email) <= 255),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 40),
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  message text CHECK (message IS NULL OR char_length(message) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'rejected', 'closed')),
  source text NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'sales', 'referral')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_status_created
  ON public.subscription_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_email_created
  ON public.subscription_requests(lower(email), created_at DESC);

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_subscription_requests_updated ON public.subscription_requests;
CREATE TRIGGER trg_subscription_requests_updated
  BEFORE UPDATE ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

REVOKE ALL ON TABLE public.subscription_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.subscription_requests TO authenticated;

DROP POLICY IF EXISTS subscription_requests_system_owner_read ON public.subscription_requests;
CREATE POLICY subscription_requests_system_owner_read
  ON public.subscription_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role));

DROP POLICY IF EXISTS subscription_requests_system_owner_update ON public.subscription_requests;
CREATE POLICY subscription_requests_system_owner_update
  ON public.subscription_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));

CREATE OR REPLACE FUNCTION public.public_create_subscription_request(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_name text := trim(coalesce(p_payload->>'clinic_name', ''));
  v_owner_name text := trim(coalesce(p_payload->>'owner_name', ''));
  v_email text := lower(trim(coalesce(p_payload->>'email', '')));
  v_phone text := nullif(trim(coalesce(p_payload->>'phone', '')), '');
  v_message text := nullif(trim(coalesce(p_payload->>'message', '')), '');
  v_plan_id uuid;
BEGIN
  IF v_clinic_name !~ '^.{2,120}$' OR v_owner_name !~ '^.{2,120}$' THEN
    RAISE EXCEPTION 'Clinic and owner names are required' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR char_length(v_email) > 255 THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Phone number is too long' USING ERRCODE = '22023';
  END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'Message is too long' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'plan_id' AND nullif(p_payload->>'plan_id', '') IS NOT NULL THEN
    BEGIN
      v_plan_id := (p_payload->>'plan_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = v_plan_id AND is_active = true) THEN
      RAISE EXCEPTION 'Selected plan is unavailable' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.subscription_requests
    WHERE lower(email) = v_email
      AND created_at > now() - interval '24 hours'
      AND status IN ('pending', 'contacted')
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'already_requested');
  END IF;

  INSERT INTO public.subscription_requests (clinic_name, owner_name, email, phone, plan_id, message)
  VALUES (v_clinic_name, v_owner_name, v_email, v_phone, v_plan_id, v_message);

  RETURN jsonb_build_object('accepted', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_subscription_requests(p_status text DEFAULT 'pending')
RETURNS TABLE(
  id uuid,
  clinic_name text,
  owner_name text,
  email text,
  phone text,
  plan_id uuid,
  plan_name_en text,
  plan_name_ar text,
  message text,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('all', 'pending', 'contacted', 'approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'Invalid request status' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT r.id, r.clinic_name, r.owner_name, r.email, r.phone, r.plan_id,
         p.name_en, p.name_ar, r.message, r.status, r.notes, r.created_at, r.updated_at
    FROM public.subscription_requests r
    LEFT JOIN public.subscription_plans p ON p.id = r.plan_id
   WHERE p_status IS NULL OR p_status = 'all' OR r.status = p_status
   ORDER BY r.created_at DESC
   LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_subscription_request(
  p_request_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pending', 'contacted', 'approved', 'rejected', 'closed') THEN
    RAISE EXCEPTION 'Invalid request status' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'Notes are too long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.subscription_requests
     SET status = p_status,
         notes = NULLIF(trim(coalesce(p_notes, '')), ''),
         reviewed_at = CASE WHEN p_status IN ('approved', 'rejected', 'closed') THEN now() ELSE reviewed_at END,
         reviewed_by = CASE WHEN p_status IN ('approved', 'rejected', 'closed') THEN auth.uid() ELSE reviewed_by END
   WHERE id = p_request_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_subscription_plan(
  p_plan_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plans;
  v_price_monthly numeric;
  v_price_yearly numeric;
  v_max_branches integer;
  v_max_staff integer;
  v_max_patients integer;
  v_max_invoices integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'Plan changes are required' USING ERRCODE = '22023';
  END IF;

  v_price_monthly := NULLIF(p_payload->>'price_monthly', '')::numeric;
  v_price_yearly := NULLIF(p_payload->>'price_yearly', '')::numeric;
  v_max_branches := NULLIF(p_payload->>'max_branches', '')::integer;
  v_max_staff := NULLIF(p_payload->>'max_staff', '')::integer;
  v_max_patients := NULLIF(p_payload->>'max_patients', '')::integer;
  v_max_invoices := NULLIF(p_payload->>'max_invoices_monthly', '')::integer;

  IF coalesce(v_price_monthly, 0) < 0 OR coalesce(v_price_yearly, 0) < 0
     OR coalesce(v_max_branches, 0) < 1 OR coalesce(v_max_staff, 0) < 1
     OR coalesce(v_max_patients, 0) < 1 OR coalesce(v_max_invoices, 0) < 1 THEN
    RAISE EXCEPTION 'Prices must be non-negative and limits must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'currency' AND (trim(coalesce(p_payload->>'currency', '')) = '' OR char_length(trim(p_payload->>'currency')) > 8) THEN
    RAISE EXCEPTION 'Currency is invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.subscription_plans
     SET name_ar = coalesce(nullif(trim(p_payload->>'name_ar'), ''), name_ar),
         name_en = coalesce(nullif(trim(p_payload->>'name_en'), ''), name_en),
         description_ar = CASE WHEN p_payload ? 'description_ar' THEN nullif(trim(coalesce(p_payload->>'description_ar', '')), '') ELSE description_ar END,
         description_en = CASE WHEN p_payload ? 'description_en' THEN nullif(trim(coalesce(p_payload->>'description_en', '')), '') ELSE description_en END,
         price_monthly = coalesce(v_price_monthly, price_monthly),
         price_yearly = coalesce(v_price_yearly, price_yearly),
         currency = coalesce(nullif(upper(trim(p_payload->>'currency')), ''), currency),
         max_branches = coalesce(v_max_branches, max_branches),
         max_staff = coalesce(v_max_staff, max_staff),
         max_patients = coalesce(v_max_patients, max_patients),
         max_invoices_monthly = coalesce(v_max_invoices, max_invoices_monthly),
         features = CASE WHEN p_payload ? 'features' AND jsonb_typeof(p_payload->'features') = 'object' THEN p_payload->'features' ELSE features END,
         is_popular = coalesce((p_payload->>'is_popular')::boolean, is_popular),
         is_active = coalesce((p_payload->>'is_active')::boolean, is_active),
         display_order = coalesce(NULLIF(p_payload->>'display_order', '')::integer, display_order),
         updated_at = now()
   WHERE id = p_plan_id
   RETURNING * INTO v_plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN to_jsonb(v_plan);
END;
$$;

DROP POLICY IF EXISTS plans_public_read ON public.subscription_plans;
CREATE POLICY plans_public_read
  ON public.subscription_plans FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'system_owner'::public.app_role));

DROP POLICY IF EXISTS plans_admin_write ON public.subscription_plans;
DROP POLICY IF EXISTS plans_system_owner_write ON public.subscription_plans;
CREATE POLICY plans_system_owner_write
  ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));

REVOKE ALL ON FUNCTION public.public_create_subscription_request(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_list_subscription_requests(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_update_subscription_request(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_update_subscription_plan(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_create_subscription_request(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_subscription_requests(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_subscription_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_subscription_plan(uuid, jsonb) TO authenticated;
