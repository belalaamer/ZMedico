ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.tg_record_procedure_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mr RECORD;
  proc RECORD;
  doc uuid;
  base numeric(14,2);
  pct numeric(5,2);
  fallback_pct numeric(5,2);
  inv_rec RECORD;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.doctor_commissions
      WHERE record_procedure_id = OLD.id AND status NOT IN ('paid');
    RETURN OLD;
  END IF;

  SELECT * INTO mr FROM public.medical_records WHERE id = NEW.medical_record_id;
  SELECT * INTO proc FROM public.procedures WHERE id = NEW.procedure_id;
  doc := COALESCE(NEW.performed_by, mr.doctor_id);

  IF doc IS NULL OR proc.id IS NULL THEN
    DELETE FROM public.doctor_commissions
      WHERE record_procedure_id = NEW.id AND status NOT IN ('paid');
    RETURN NEW;
  END IF;

  base := COALESCE(proc.default_price,0) * COALESCE(NEW.quantity,1);

  -- Procedure-level commission wins when set > 0; otherwise fall back to staff profile default.
  IF COALESCE(proc.doctor_commission_percent, 0) > 0 THEN
    pct := proc.doctor_commission_percent;
  ELSE
    SELECT COALESCE(commission_percent, 0) INTO fallback_pct
      FROM public.staff_profiles WHERE id = doc;
    pct := COALESCE(fallback_pct, 0);
  END IF;

  INSERT INTO public.doctor_commissions(
    doctor_id, record_procedure_id, medical_record_id, procedure_id,
    branch_id, patient_id, base_amount, commission_percent, status
  ) VALUES (
    doc, NEW.id, NEW.medical_record_id, NEW.procedure_id,
    mr.branch_id, mr.patient_id, base, pct, 'pending'
  )
  ON CONFLICT (record_procedure_id) DO UPDATE
    SET doctor_id = EXCLUDED.doctor_id,
        base_amount = EXCLUDED.base_amount,
        commission_percent = EXCLUDED.commission_percent,
        procedure_id = EXCLUDED.procedure_id,
        branch_id = EXCLUDED.branch_id,
        patient_id = EXCLUDED.patient_id,
        updated_at = now()
    WHERE public.doctor_commissions.status NOT IN ('paid');

  FOR inv_rec IN SELECT id FROM public.invoices
    WHERE medical_record_id = NEW.medical_record_id AND deleted_at IS NULL
  LOOP
    PERFORM public.recalc_commissions_for_invoice(inv_rec.id);
  END LOOP;

  RETURN NEW;
END; $function$;