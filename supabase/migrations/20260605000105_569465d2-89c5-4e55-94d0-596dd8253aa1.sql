CREATE OR REPLACE FUNCTION public.tg_treatment_session_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  plan_id uuid;
  total int;
  done int;
  v_plan public.treatment_plans%ROWTYPE;
  v_invoice_id uuid;
  v_inv_num text;
BEGIN
  plan_id := COALESCE(NEW.treatment_plan_id, OLD.treatment_plan_id);
  SELECT * INTO v_plan FROM public.treatment_plans WHERE id = plan_id;
  total := v_plan.total_sessions;
  SELECT count(*) INTO done FROM public.treatment_sessions
    WHERE treatment_plan_id = plan_id AND status = 'completed';

  IF total IS NOT NULL THEN
    IF done >= total THEN
      UPDATE public.treatment_plans
        SET status = CASE WHEN status IN ('cancelled') THEN status ELSE 'completed' END,
            end_date = COALESCE(end_date, current_date),
            updated_at = now()
        WHERE id = plan_id AND status <> 'cancelled';

      IF v_plan.status <> 'cancelled' AND v_plan.invoice_id IS NULL AND COALESCE(v_plan.price, 0) > 0 THEN
        v_inv_num := public.generate_invoice_number();
        INSERT INTO public.invoices (invoice_number, patient_id, branch_id, invoice_date, subtotal, total, status, notes, created_by)
        VALUES (
          v_inv_num, v_plan.patient_id, v_plan.branch_id, current_date,
          v_plan.price, v_plan.price, 'pending'::invoice_status,
          COALESCE(v_plan.name_en, v_plan.name_ar), v_plan.created_by
        )
        RETURNING id INTO v_invoice_id;

        INSERT INTO public.invoice_items (invoice_id, description_en, description_ar, quantity, unit_price, total, item_type)
        VALUES (
          v_invoice_id,
          COALESCE(v_plan.name_en, v_plan.name_ar, 'Treatment Plan'),
          COALESCE(v_plan.name_ar, v_plan.name_en, 'خطة علاج'),
          1, v_plan.price, v_plan.price, 'service'::invoice_item_type
        );

        UPDATE public.treatment_plans SET invoice_id = v_invoice_id WHERE id = plan_id;
      END IF;
    ELSE
      UPDATE public.treatment_plans
        SET status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
            updated_at = now()
        WHERE id = plan_id AND status = 'completed';
    END IF;
  END IF;
  RETURN NULL;
END; $function$;