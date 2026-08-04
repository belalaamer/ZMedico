-- Record which appointment a physio case originated from.
--
-- CONTEXT: the physio module was orphaned from the appointment workflow -- no
-- screen linked to it, which is why a physiotherapy clinic had zero physio
-- cases. A "Start Physio Case" action was added to the completed-appointment
-- screen, and it passes ?appointment=<id> through. Until now nothing could
-- store it.
--
-- WHY ON THE CASE AND NOT THE SESSION: physio_sessions.appointment_id already
-- exists and is the right place to record "this session happened at that
-- appointment". But the useful audit question is "which visit started this course
-- of treatment", and that belongs to the case. Auto-copying the originating
-- appointment onto every session would be wrong -- session 5 did not happen at
-- the appointment that opened the case.
--
-- ON DELETE SET NULL, not CASCADE: deleting an appointment must never delete a
-- course of physiotherapy treatment.

ALTER TABLE public.physio_cases
  ADD COLUMN IF NOT EXISTS appointment_id uuid
  REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS physio_cases_appointment_idx
  ON public.physio_cases (appointment_id);

COMMENT ON COLUMN public.physio_cases.appointment_id IS
  'The appointment this course of treatment was opened from, when the case was started via the Start Physio Case action. Nullable: cases created directly from the physio module have none.';

-- Integrity guard: a case may only cite an appointment belonging to the same
-- patient and the same branch. Mirrors tg_physio_sessions_validate_appointment.
CREATE OR REPLACE FUNCTION public.tg_physio_cases_validate_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  a_patient uuid;
  a_branch  uuid;
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT patient_id, branch_id INTO a_patient, a_branch
  FROM public.appointments WHERE id = NEW.appointment_id;

  IF a_patient IS NULL THEN
    RAISE EXCEPTION 'Appointment % does not exist', NEW.appointment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF a_patient IS DISTINCT FROM NEW.patient_id THEN
    RAISE EXCEPTION 'Appointment % belongs to a different patient', NEW.appointment_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.branch_id IS NOT NULL AND a_branch IS NOT NULL
     AND a_branch IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'Appointment % belongs to a different branch', NEW.appointment_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_physio_cases_validate_appointment ON public.physio_cases;
CREATE TRIGGER trg_physio_cases_validate_appointment
  BEFORE INSERT OR UPDATE OF appointment_id, patient_id, branch_id
  ON public.physio_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_physio_cases_validate_appointment();
