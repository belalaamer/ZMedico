
-- Replace global unique constraint with partial unique (only active patients)
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_patient_code_key;
DROP INDEX IF EXISTS public.patients_patient_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_code_active_key
  ON public.patients(patient_code)
  WHERE deleted_at IS NULL;

-- Trigger: assign smallest available code among active patients
CREATE OR REPLACE FUNCTION public.tg_patient_assign_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_code int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('patients_patient_code'));

  IF NEW.patient_code IS NULL OR NEW.patient_code = 0 THEN
    -- Smallest positive integer not used by an active (non-deleted) patient
    SELECT COALESCE(MIN(t.n), 1) INTO next_code
    FROM (
      SELECT generate_series(1, COALESCE((SELECT MAX(patient_code) FROM public.patients WHERE deleted_at IS NULL), 0) + 1) AS n
    ) t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.deleted_at IS NULL AND p.patient_code = t.n
    );

    NEW.patient_code := next_code;
  END IF;

  RETURN NEW;
END;
$function$;
