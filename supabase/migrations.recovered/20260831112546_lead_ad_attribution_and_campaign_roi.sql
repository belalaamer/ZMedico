-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260831112546
-- name: lead_ad_attribution_and_campaign_roi
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- 1) Enrich the public-booking lead with ad attribution carried in
-- appointments.public_booking_metadata->'attribution' (set by the booking page).
-- Pure jsonb extraction with coalesce/nullif only: a missing or malformed
-- attribution object degrades to NULLs, never to an error, so the booking
-- path cannot break.
CREATE OR REPLACE FUNCTION public.tg_public_booking_to_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stage uuid;
  v_name text;
  v_phone text;
  v_lead uuid;
  v_attr jsonb;
BEGIN
  IF NEW.public_booking_reference IS NULL THEN RETURN NEW; END IF;

  v_attr := CASE WHEN jsonb_typeof(NEW.public_booking_metadata->'attribution') = 'object'
                 THEN NEW.public_booking_metadata->'attribution' ELSE '{}'::jsonb END;

  SELECT id INTO v_stage
  FROM public.lead_pipeline_stages
  WHERE slug = 'appointment-booked' AND (branch_id = NEW.branch_id OR branch_id IS NULL)
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  SELECT COALESCE(NEW.public_booking_metadata->>'public_name', p.first_name_en)
    INTO v_name FROM public.patients p WHERE p.id = NEW.patient_id;
  SELECT COALESCE(NEW.public_booking_metadata->>'phone_digits', p.phone)
    INTO v_phone FROM public.patients p WHERE p.id = NEW.patient_id;

  INSERT INTO public.leads (
    branch_id, full_name, phone, phone_normalized, source, platform, stage_id,
    complaint, patient_id, appointment_id, lead_score, last_activity_at, created_by,
    campaign_id, campaign_name, ad_set, ad_name, utm_parameters
  ) VALUES (
    NEW.branch_id, COALESCE(v_name, 'Public booking'), COALESCE(v_phone, 'unknown'),
    regexp_replace(COALESCE(v_phone, 'unknown'), '[^0-9]', '', 'g'),
    COALESCE(NULLIF(NEW.booking_source, ''), 'public_booking'),
    COALESCE(NULLIF(v_attr->>'utm_source', ''), 'Website'),
    v_stage, NEW.notes, NEW.patient_id, NEW.id, 80, now(), NULL,
    NULLIF(v_attr->>'campaign_id', ''),
    NULLIF(v_attr->>'utm_campaign', ''),
    COALESCE(NULLIF(v_attr->>'adset_name', ''), NULLIF(v_attr->>'utm_term', '')),
    COALESCE(NULLIF(v_attr->>'ad_name', ''), NULLIF(v_attr->>'utm_content', '')),
    NULLIF(v_attr, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_lead;

  IF v_lead IS NOT NULL THEN
    INSERT INTO public.lead_activities (lead_id, branch_id, activity_type, channel, body, metadata, created_by)
    VALUES (v_lead, NEW.branch_id, 'appointment_booked', 'website', 'Appointment booked through public booking page',
      jsonb_build_object('appointment_id', NEW.id, 'booking_reference', NEW.public_booking_reference), NULL);
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Campaign ROI aggregation for the in-house dashboard. lead_campaign_spend
-- has RLS with zero policies (deny-all for clients), so a guarded SECURITY
-- DEFINER function is the only sanctioned read path.
CREATE OR REPLACE FUNCTION public.get_campaign_roi(p_branch_id uuid, p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb;
BEGIN
  IF p_branch_id IS NULL OR NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'branch_access_denied';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'manager'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end - p_start > 366 THEN
    RAISE EXCEPTION 'invalid_date_range';
  END IF;

  WITH spend AS (
    SELECT COALESCE(NULLIF(campaign_id, ''), campaign_name) AS ckey,
           MAX(campaign_name) AS campaign_name,
           MAX(currency) AS currency,
           SUM(COALESCE(spend, 0)) AS spend,
           SUM(COALESCE(link_clicks, clicks, 0)) AS clicks
    FROM public.lead_campaign_spend
    WHERE branch_id = p_branch_id AND is_active
      AND report_date BETWEEN p_start AND p_end
    GROUP BY 1
  ),
  lead_rows AS (
    SELECT l.id, l.patient_id, l.appointment_id, l.platform,
           COALESCE(NULLIF(l.campaign_id, ''), NULLIF(l.campaign_name, '')) AS ckey,
           l.campaign_name,
           EXISTS (SELECT 1 FROM public.appointments a
                   WHERE a.id = l.appointment_id AND a.status = 'completed') AS attended,
           COALESCE((SELECT SUM(pm.amount) FROM public.payments pm
                     WHERE pm.patient_id = l.patient_id AND pm.deleted_at IS NULL
                       AND pm.payment_date BETWEEN p_start AND p_end), 0) AS revenue
    FROM public.leads l
    WHERE l.branch_id = p_branch_id AND l.deleted_at IS NULL
      AND l.created_at >= p_start AND l.created_at < (p_end + 1)
  ),
  lead_agg AS (
    SELECT ckey,
           MAX(campaign_name) AS campaign_name,
           MAX(platform) AS platform,
           COUNT(*) AS leads,
           COUNT(appointment_id) AS booked,
           COUNT(*) FILTER (WHERE attended) AS attended,
           SUM(revenue) AS revenue
    FROM lead_rows
    GROUP BY ckey
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'campaign_key', COALESCE(s.ckey, la.ckey),
           'campaign_name', COALESCE(s.campaign_name, la.campaign_name),
           'platform', la.platform,
           'currency', s.currency,
           'spend', COALESCE(s.spend, 0),
           'clicks', COALESCE(s.clicks, 0),
           'leads', COALESCE(la.leads, 0),
           'booked', COALESCE(la.booked, 0),
           'attended', COALESCE(la.attended, 0),
           'revenue', COALESCE(la.revenue, 0)
         ) ORDER BY COALESCE(s.spend, 0) DESC, COALESCE(la.leads, 0) DESC), '[]'::jsonb)
    INTO v_out
  FROM spend s
  FULL OUTER JOIN lead_agg la ON la.ckey = s.ckey;

  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_campaign_roi(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campaign_roi(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_roi(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_roi(uuid, date, date) TO service_role;
