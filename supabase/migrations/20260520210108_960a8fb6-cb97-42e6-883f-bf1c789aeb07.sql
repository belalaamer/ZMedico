CREATE OR REPLACE FUNCTION public.renumber_active_patient_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('patients_patient_code'));

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS new_code
    FROM public.patients
    WHERE deleted_at IS NULL
  )
  UPDATE public.patients p
  SET patient_code = ranked.new_code
  FROM ranked
  WHERE p.id = ranked.id
    AND p.patient_code IS DISTINCT FROM ranked.new_code;
END;
$function$;

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
    FROM public.patients
    WHERE deleted_at IS NULL;

    NEW.patient_code := next_code;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_patient_renumber_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public.renumber_active_patient_codes();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_patient_renumber_after_soft_delete ON public.patients;
CREATE TRIGGER tg_patient_renumber_after_soft_delete
AFTER UPDATE OF deleted_at ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.tg_patient_renumber_after_soft_delete();