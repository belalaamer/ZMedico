
-- 1. Block delete of billed record_procedures ------------------------------
CREATE OR REPLACE FUNCTION public.tg_block_delete_billed_procedure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoice_items ii
    JOIN public.invoices inv ON inv.id = ii.invoice_id
    WHERE ii.record_procedure_id = OLD.id
      AND inv.deleted_at IS NULL
      AND inv.status IN ('paid','partial')
  ) THEN
    RAISE EXCEPTION 'Cannot delete a procedure that has already been billed.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_delete_billed_procedure ON public.record_procedures;
CREATE TRIGGER trg_block_delete_billed_procedure
BEFORE DELETE ON public.record_procedures
FOR EACH ROW EXECUTE FUNCTION public.tg_block_delete_billed_procedure();

-- 2. Cascade patient soft-delete -----------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cascade_patient_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.appointments
       SET deleted_at = now()
     WHERE patient_id = NEW.id
       AND deleted_at IS NULL
       AND scheduled_at >= now();

    UPDATE public.reminders
       SET status = 'cancelled'
     WHERE patient_id = NEW.id
       AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_patient_soft_delete ON public.patients;
CREATE TRIGGER trg_cascade_patient_soft_delete
AFTER UPDATE OF deleted_at ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.tg_cascade_patient_soft_delete();

-- 3. Medical-record immutability -----------------------------------------
DROP POLICY IF EXISTS "rec_update_clinical" ON public.medical_records;
CREATE POLICY "rec_update_clinical" ON public.medical_records
FOR UPDATE TO authenticated
USING (
  doctor_id = auth.uid()
  AND status = 'draft'
  AND deleted_at IS NULL
)
WITH CHECK (
  doctor_id = auth.uid()
  AND status = 'draft'
);

-- Admin override RPC with mandatory audit log
CREATE OR REPLACE FUNCTION public.admin_override_medical_record(
  _record_id UUID,
  _new_notes TEXT,
  _admin_id  UUID
)
RETURNS public.medical_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.medical_records%ROWTYPE;
  v_new public.medical_records%ROWTYPE;
BEGIN
  IF NOT public.has_role(_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins may override a medical record.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_old FROM public.medical_records WHERE id = _record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Medical record not found.';
  END IF;

  UPDATE public.medical_records
     SET notes_en   = _new_notes,
         updated_at = now()
   WHERE id = _record_id
  RETURNING * INTO v_new;

  INSERT INTO public.audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (
    _admin_id,
    v_new.branch_id,
    'admin_override',
    'medical_records',
    _record_id,
    jsonb_build_object('notes_en', v_old.notes_en, 'status', v_old.status, 'doctor_id', v_old.doctor_id),
    jsonb_build_object('notes_en', v_new.notes_en, 'overridden_by', _admin_id, 'overridden_at', now())
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_override_medical_record(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_override_medical_record(UUID, TEXT, UUID) TO authenticated;

-- 4. Enforce branch_id NOT NULL on core clinical/financial tables ---------
DO $$
DECLARE
  v_default_branch UUID;
BEGIN
  SELECT id INTO v_default_branch FROM public.branches
   ORDER BY created_at ASC LIMIT 1;

  IF v_default_branch IS NOT NULL THEN
    UPDATE public.medical_records SET branch_id = v_default_branch WHERE branch_id IS NULL;
    UPDATE public.invoices        SET branch_id = v_default_branch WHERE branch_id IS NULL;
    UPDATE public.appointments    SET branch_id = v_default_branch WHERE branch_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.medical_records ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.invoices        ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.appointments    ALTER COLUMN branch_id SET NOT NULL;
