REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_reminders(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders(uuid) TO service_role;
