-- Applied live 2026-08-04 as migration 20260804205604.
--
-- Found while testing the previous migration: soft-deleting ONE patient silently
-- renumbered EVERY remaining patient.
--
--   tg_patient_renumber_after_soft_delete -> renumber_active_patient_codes()
--   ... UPDATE patients SET patient_code = ROW_NUMBER() OVER (ORDER BY created_at)
--       WHERE deleted_at IS NULL
--
-- So patient_code was never an identifier at all -- it was a display position
-- that shifted under everyone's feet. Consequences in a live clinic:
--   * a code written on a paper file, told to a patient on the phone, or quoted
--     in a referral stops pointing at that patient;
--   * the code in an older audit_logs entry no longer resolves to the same person,
--     which quietly destroys the evidentiary value of the audit trail;
--   * it is why code 1 is currently shared by ten rows -- repeated renumbering
--     churn, not a one-off mistake.
--
-- This is the same defect already removed from invoice numbering earlier today,
-- for the same reason. A number that identifies a real-world thing is issued
-- once and then never changes. Gaps in the sequence are correct and expected;
-- closing the gaps is what breaks it.
--
-- Dropping this also unblocks the monotonic assignment from the previous
-- migration: monotonic codes deliberately leave gaps, and the renumberer treated
-- every gap as something to squeeze out, colliding with
-- patients_patient_code_active_key.
--
-- Existing duplicate codes are left exactly as they are. They are historical
-- fact, and rewriting real patient records to tidy the sequence is precisely the
-- behaviour being removed here.

DROP TRIGGER IF EXISTS tg_patient_renumber_after_soft_delete ON public.patients;
DROP FUNCTION IF EXISTS public.tg_patient_renumber_after_soft_delete() CASCADE;
DROP FUNCTION IF EXISTS public.renumber_active_patient_codes() CASCADE;

-- Belt and braces: refuse the change even if something else tries to rewrite a
-- code directly. Assignment happens once, in the BEFORE INSERT trigger.
CREATE OR REPLACE FUNCTION public.tg_patient_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.patient_code IS DISTINCT FROM OLD.patient_code THEN
    RAISE EXCEPTION 'Patient code % is permanent and cannot be changed (attempted: %).',
      OLD.patient_code, NEW.patient_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_patient_code_immutable ON public.patients;
CREATE TRIGGER trg_patient_code_immutable
  BEFORE UPDATE OF patient_code ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.tg_patient_code_immutable();
