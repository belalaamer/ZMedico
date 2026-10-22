-- ZMED-290 option A: the booking-expiry warning becomes an in-app alert only.
--
-- The previous body wrote two things per staff recipient: an in-app notification with
-- type='appointment' and, when the staff row had a phone, a WhatsApp reminder row. Both
-- were guaranteed to fail: notifications carries the partial unique index
-- idx_unique_appointment_notification (user_id, related_entity_id, type) WHERE
-- type = 'appointment' AND related_entity_id IS NOT NULL, and the appointment-creation
-- trigger tg_appointment_create_notifications already owns that key for a superset of the
-- same recipients (23505); and 'booking_expiry_warning' is not an accepted value of
-- reminders_event_type_check (23514). Either error aborted the whole pg_cron transaction,
-- destroying the alert and the booking_expiry_alert_sent_at stamp, so the job retried the
-- same booking forever.
--
-- This revision keeps the alert (type='alert', which Topbar.tsx already renders as a
-- warning icon and which still links through related_entity_type/related_entity_id), drops
-- the WhatsApp leg entirely, and stops requiring staff_profiles so the recipient set no
-- longer depends on a table that exists only to describe employment. No patient message is
-- produced or removed by this change, and no business row is corrected.

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
  v_title_en text;
  v_title_ar text;
  v_message_en text;
  v_message_ar text;
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
    v_patient_name := COALESCE(
      NULLIF(trim(v_appt.first_name_en), ''),
      NULLIF(trim(v_appt.first_name_ar), ''),
      'Patient');
    v_minutes := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_appt.booking_request_expires_at - now())) / 60)::integer);
    v_title_en := 'Booking request expiring soon';
    v_title_ar := 'طلب حجز على وشك انتهاء المهلة';
    v_message_en := format('Booking %s (%s) expires in %s min. Confirm or reject it now.',
                           COALESCE(v_appt.public_booking_reference, ''), v_patient_name, v_minutes);
    v_message_ar := format('طلب الحجز %s (%s) ستنتهي مهلته بعد %s دقيقة. أكّده أو ارفضه الآن.',
                           COALESCE(v_appt.public_booking_reference, ''), v_patient_name, v_minutes);

    FOR v_staff IN
      SELECT DISTINCT sb.user_id
      FROM public.staff_branches sb
      JOIN public.user_roles ur ON ur.user_id = sb.user_id
      WHERE sb.branch_id = v_appt.branch_id
        AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role)
    LOOP
      -- type='alert' is deliberate: the appointment-creation notification owns the
      -- (user, appointment) slot under the type='appointment' partial unique index, so
      -- reusing that type can never insert a second alert for the same booking.
      INSERT INTO public.notifications
        (user_id, branch_id, title_en, title_ar, message_en, message_ar, type,
         related_entity_type, related_entity_id)
      VALUES
        (v_staff.user_id, v_appt.branch_id, v_title_en, v_title_ar, v_message_en, v_message_ar,
         'alert'::public.notification_type, 'appointment', v_appt.id);
    END LOOP;

    UPDATE public.appointments
       SET booking_expiry_alert_sent_at = now()
     WHERE id = v_appt.id;
  END LOOP;
END;
$function$;

-- Match the ACL the live object already carries: helper for pg_cron, never a client RPC.
REVOKE ALL ON FUNCTION public.notify_pending_booking_expiry_soon() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_pending_booking_expiry_soon() TO service_role;

-- Register the job the repository never contained, so a rebuild reproduces it. The command
-- is unchanged; only the schedule name and interval are pinned here for the first time.
--
-- Skip-when-identical is deliberate. Measured on the isolated QA stack, cron.unschedule()
-- answers "could not find valid entry" for jobs that are present in cron.job, and direct
-- DELETE on cron.job is denied to the migration role - so an unnecessary alter_job here
-- would fail the migration on any environment whose pg_cron worker is not holding the job
-- in shared memory. A rebuild still gets the job; a live job is only touched when it is
-- actually wrong.
DO $migration$
DECLARE
  v_job_id bigint;
  v_schedule text;
  v_command text;
  v_desired_command text := 'SELECT public.notify_pending_booking_expiry_soon();';
  v_desired_schedule text := '1-59/2 * * * *';
BEGIN
  SELECT jobid, schedule, command INTO v_job_id, v_schedule, v_command
    FROM cron.job WHERE jobname = 'notify-pending-booking-expiry' LIMIT 1;

  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('notify-pending-booking-expiry', v_desired_schedule,
      $cron$SELECT public.notify_pending_booking_expiry_soon();$cron$);
  ELSIF v_command IS DISTINCT FROM v_desired_command
        OR v_schedule IS DISTINCT FROM v_desired_schedule THEN
    PERFORM cron.alter_job(
      job_id := v_job_id,
      schedule := v_desired_schedule,
      command := v_desired_command
    );
  END IF;
END
$migration$;
