
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.render_template(text, jsonb) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_reminders(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_appt_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_appt_after_update() FROM PUBLIC, anon, authenticated;
