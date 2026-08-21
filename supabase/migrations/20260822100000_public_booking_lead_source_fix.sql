-- Public booking source may contain a UTM source such as facebook or instagram.
-- Use the public reference as the authoritative trigger marker instead of
-- requiring booking_source to equal one literal string.
CREATE OR REPLACE FUNCTION public.tg_public_booking_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage uuid;
  v_name text;
  v_phone text;
  v_lead uuid;
BEGIN
  IF NEW.public_booking_reference IS NULL THEN RETURN NEW; END IF;

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
    complaint, patient_id, appointment_id, lead_score, last_activity_at, created_by
  ) VALUES (
    NEW.branch_id, COALESCE(v_name, 'Public booking'), COALESCE(v_phone, 'unknown'),
    regexp_replace(COALESCE(v_phone, 'unknown'), '[^0-9]', '', 'g'),
    COALESCE(NULLIF(NEW.booking_source, ''), 'public_booking'), 'Website',
    v_stage, NEW.notes, NEW.patient_id, NEW.id, 80, now(), NULL
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
$$;
