
-- 1) Appointment linkage integrity for physio_sessions
CREATE OR REPLACE FUNCTION public.tg_physio_sessions_validate_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  case_patient uuid;
  case_branch uuid;
  appt_patient uuid;
  appt_branch uuid;
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT patient_id, branch_id INTO case_patient, case_branch
    FROM public.physio_cases WHERE id = NEW.case_id;

  SELECT patient_id, branch_id INTO appt_patient, appt_branch
    FROM public.appointments WHERE id = NEW.appointment_id;

  IF appt_patient IS NULL THEN
    RAISE EXCEPTION 'Linked appointment % not found', NEW.appointment_id;
  END IF;
  IF appt_patient IS DISTINCT FROM case_patient THEN
    RAISE EXCEPTION 'Linked appointment belongs to a different patient than this physio case';
  END IF;
  IF appt_branch IS DISTINCT FROM case_branch THEN
    RAISE EXCEPTION 'Linked appointment belongs to a different branch than this physio case';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_physio_sessions_validate_appointment ON public.physio_sessions;
CREATE TRIGGER tg_physio_sessions_validate_appointment
  BEFORE INSERT OR UPDATE OF appointment_id, case_id ON public.physio_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_physio_sessions_validate_appointment();

-- 2) Auto-clear follow-up state when a case is closed
CREATE OR REPLACE FUNCTION public.tg_physio_cases_clear_followup_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.followup_enabled := false;
    NEW.followup_due_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_physio_cases_clear_followup_on_close ON public.physio_cases;
CREATE TRIGGER tg_physio_cases_clear_followup_on_close
  BEFORE UPDATE OF status ON public.physio_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_physio_cases_clear_followup_on_close();
