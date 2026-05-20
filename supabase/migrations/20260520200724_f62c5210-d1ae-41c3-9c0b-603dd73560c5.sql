
-- Replace sequence-based patient_code default with trigger using max(active)+1.
ALTER TABLE public.patients ALTER COLUMN patient_code DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.tg_patient_assign_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_code int;
BEGIN
  -- Serialize concurrent inserts to avoid duplicate codes
  PERFORM pg_advisory_xact_lock(hashtext('patients_patient_code'));
  IF NEW.patient_code IS NULL OR NEW.patient_code = 0 THEN
    SELECT COALESCE(MAX(patient_code), 0) + 1
      INTO next_code
      FROM public.patients
      WHERE deleted_at IS NULL;
    NEW.patient_code := next_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_patient_assign_code ON public.patients;
CREATE TRIGGER tg_patient_assign_code
BEFORE INSERT ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.tg_patient_assign_code();
