-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260831113448
-- name: lead_attribution_top_level_utm_fallback
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- The booking page has historically sent utm_source/utm_medium/utm_campaign
-- as TOP-LEVEL keys of public_booking_metadata (and still does, alongside the
-- new nested 'attribution' object). Fall back to those keys when the nested
-- object is absent, so attribution still lands even if sessionStorage was
-- empty at submit time.
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
  -- Top-level legacy keys as fallback (nested object wins on conflict).
  v_attr := jsonb_strip_nulls(jsonb_build_object(
              'utm_source',   NEW.public_booking_metadata->>'utm_source',
              'utm_medium',   NEW.public_booking_metadata->>'utm_medium',
              'utm_campaign', NEW.public_booking_metadata->>'utm_campaign',
              'landing_page', NEW.public_booking_metadata->>'landing_path'
            )) || v_attr;

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
