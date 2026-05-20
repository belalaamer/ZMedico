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
    SELECT COALESCE(MAX(patient_code), 0) + 1
      INTO next_code
      FROM public.patients;

    NEW.patient_code := next_code;
  END IF;

  RETURN NEW;
END;
$function$;