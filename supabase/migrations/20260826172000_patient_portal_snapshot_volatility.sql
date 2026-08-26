-- patient_portal_snapshot records last_seen_at, so it must be VOLATILE.
ALTER FUNCTION public.patient_portal_snapshot() VOLATILE;
