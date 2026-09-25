-- Reduce pg_cron scheduler overhead for public-booking maintenance.
--
-- Slot availability already treats a pending request as non-blocking as soon
-- as booking_request_expires_at <= now(), independently of this cleanup job.
-- A 2-minute cleanup cadence therefore does not keep slots reserved longer.
--
-- Expiry warnings have a 5-minute eligibility window. Running every 2 minutes
-- preserves that warning window while cutting the two per-minute jobs' run
-- volume in half. Stagger even/odd minutes to avoid both jobs waking together.

DO $$
DECLARE v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'expire-public-booking-requests',
      'notify-pending-booking-expiry'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'expire-public-booking-requests',
  '*/2 * * * *',
  'SELECT public.cron_expire_public_booking_requests();'
);

SELECT cron.schedule(
  'notify-pending-booking-expiry',
  '1-59/2 * * * *',
  'SELECT public.notify_pending_booking_expiry_soon();'
);
