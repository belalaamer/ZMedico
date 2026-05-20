REVOKE ALL ON FUNCTION public.renumber_active_patient_codes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_patient_assign_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_patient_renumber_after_soft_delete() FROM PUBLIC, anon, authenticated;