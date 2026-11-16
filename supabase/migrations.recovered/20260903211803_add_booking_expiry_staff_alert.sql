-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260903211803
-- name: add_booking_expiry_staff_alert
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS booking_expiry_alert_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.notify_pending_booking_expiry_soon()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt record;
  v_staff record;
  v_patient_name text;
  v_minutes integer;
BEGIN
  FOR v_appt IN
    SELECT a.id, a.branch_id, a.scheduled_at, a.booking_request_expires_at, a.public_booking_reference,
           p.first_name_en, p.first_name_ar
    FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id
    WHERE a.booking_request_status = 'pending'
      AND a.deleted_at IS NULL
      AND a.booking_expiry_alert_sent_at IS NULL
      AND a.booking_request_expires_at IS NOT NULL
      AND a.booking_request_expires_at <= now() + interval '5 minutes'
      AND a.booking_request_expires_at > now()
  LOOP
    v_patient_name := COALESCE(v_appt.first_name_en, v_appt.first_name_ar, 'Patient');
    v_minutes := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_appt.booking_request_expires_at - now())) / 60)::integer);

    FOR v_staff IN
      SELECT DISTINCT sp.linked_user_id AS user_id, sp.phone
      FROM public.staff_branches sb
      JOIN public.user_roles ur ON ur.user_id = sb.user_id
      JOIN public.staff_profiles sp ON sp.linked_user_id = sb.user_id
      WHERE sb.branch_id = v_appt.branch_id
        AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role)
    LOOP
      INSERT INTO public.notifications (user_id, branch_id, title_en, title_ar, message_en, message_ar, type, related_entity_type, related_entity_id)
      VALUES (
        v_staff.user_id, v_appt.branch_id,
        'Booking request expiring soon', 'طلب حجز على وشك انتهاء المهلة',
        format('Booking %s (%s) expires in %s min. Confirm or reject it now.', COALESCE(v_appt.public_booking_reference, ''), v_patient_name, v_minutes),
        format('طلب الحجز %s (%s) ستنتهي مهلته بعد %s دقيقة. أكّده أو ارفضه الآن.', COALESCE(v_appt.public_booking_reference, ''), v_patient_name, v_minutes),
        'appointment', 'appointment', v_appt.id
      );

      IF v_staff.phone IS NOT NULL AND trim(v_staff.phone) <> '' THEN
        INSERT INTO public.reminders (branch_id, reminder_type, scheduled_time, message_en, message_ar, status, event_type, destination_phone, destination_channel, payload)
        VALUES (
          v_appt.branch_id, 'whatsapp'::public.reminder_channel, now(),
          format('Booking %s (%s) expires in %s min. Confirm or reject it now.', COALESCE(v_appt.public_booking_reference, ''), v_patient_name, v_minutes),
          format('طلب الحجز %s (%s) ستنتهي مهلته بعد %s دقيقة. أكّده أو ارفضه الآن.', COALESCE(v_appt.public_booking_reference, ''), v_patient_name, v_minutes),
          'pending'::public.reminder_status, 'booking_expiry_warning', v_staff.phone, 'whatsapp',
          jsonb_build_object('appointment_id', v_appt.id, 'booking_reference', v_appt.public_booking_reference)
        );
      END IF;
    END LOOP;

    UPDATE public.appointments SET booking_expiry_alert_sent_at = now() WHERE id = v_appt.id;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_pending_booking_expiry_soon() FROM PUBLIC;

