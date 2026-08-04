-- Applied live 2026-08-04 as migration 20260804205006.
--
-- Four defects found by systematically probing UPDATE/DELETE per role. Earlier
-- reviews only ever tested READ access, which is why these survived.

-- =====================================================================
-- 1. A recorded payment must be immutable.
--
-- PROVEN: accountant and manager could run
--     UPDATE payments SET amount = 1 WHERE id = <any payment>
-- No trigger recalculates the invoice or the ledger on a payment UPDATE, so
-- collecting 500 and later rewriting it to 1 silently desynchronises the books
-- while the treasury entry still says 500. This is exactly how cash goes missing
-- without a trace.
--
-- A payment is a record of something that physically happened. Corrections are
-- made by reversing it and recording a new one, never by editing it -- the same
-- principle already applied to invoice numbers and the treasury ledger.
--
-- Mutable by design: deleted_at (the reversal path), treasury_id (assigned by
-- tg_payment_after_insert immediately after insert), and the descriptive fields.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_payment_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.amount         IS DISTINCT FROM OLD.amount
  OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
  OR NEW.invoice_id     IS DISTINCT FROM OLD.invoice_id
  OR NEW.patient_id     IS DISTINCT FROM OLD.patient_id
  OR NEW.branch_id      IS DISTINCT FROM OLD.branch_id
  OR NEW.payment_date   IS DISTINCT FROM OLD.payment_date
  OR COALESCE(NEW.is_wallet_topup,false) IS DISTINCT FROM COALESCE(OLD.is_wallet_topup,false)
  THEN
    RAISE EXCEPTION 'A recorded payment cannot be altered. Reverse it and record a new payment instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_payment_immutable ON public.payments;
CREATE TRIGGER trg_payment_immutable
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_immutable_fields();

-- =====================================================================
-- 2. An invoice that has been paid must not have its amount changed.
--
-- PROVEN: accountant and manager could rewrite subtotal/total on any invoice,
-- including one already settled. Combined with immutable invoice numbers that
-- would leave a document whose number is fixed but whose amount is not.
--
-- Editing remains allowed while no money has been taken, which is the normal
-- correct-a-draft case. Once a live payment exists the figures are locked; the
-- route is to void the invoice and issue a new one.
-- paid_amount and status stay mutable -- recalc_invoice_payments must keep working.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_invoice_amount_locked_when_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
  OR NEW.discount IS DISTINCT FROM OLD.discount
  OR NEW.tax      IS DISTINCT FROM OLD.tax
  THEN
    IF EXISTS (SELECT 1 FROM public.payments
                WHERE invoice_id = NEW.id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Invoice % has payments recorded against it and its amount can no longer be changed. Void it and issue a new invoice instead.',
        OLD.invoice_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_invoice_amount_locked ON public.invoices;
CREATE TRIGGER trg_invoice_amount_locked
  BEFORE UPDATE OF subtotal, discount, tax ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_amount_locked_when_paid();

-- =====================================================================
-- 3. Patient records were not audited at all.
--
-- Every other sensitive table has an audit trigger; public.patients had none.
-- That is why the English first names damaged earlier today could not be
-- recovered -- there was no record of what they had been. It is also a
-- straightforward requirement for clinical systems (HIPAA 164.312(b) audit
-- controls, and Egypt's PDPL 151/2018 treats health data as a special category).
--
-- Identity, contact and branch changes are recorded, plus creation and deletion.
-- Clinical detail is deliberately NOT copied into audit_logs: the point is to
-- know who changed what, not to duplicate the medical record.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_audit_patients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_write('patient', NEW.id, 'create', NULL,
      jsonb_build_object(
        'patient_code', NEW.patient_code,
        'name_en', trim(concat_ws(' ', NEW.first_name_en, NEW.last_name_en)),
        'name_ar', trim(concat_ws(' ', NEW.first_name_ar, NEW.last_name_ar)),
        'phone', NEW.phone),
      NEW.branch_id, auth.uid());
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public._audit_write('patient', OLD.id, 'delete',
      jsonb_build_object(
        'patient_code', OLD.patient_code,
        'name_en', trim(concat_ws(' ', OLD.first_name_en, OLD.last_name_en)),
        'name_ar', trim(concat_ws(' ', OLD.first_name_ar, OLD.last_name_ar)),
        'phone', OLD.phone),
      NULL, OLD.branch_id, auth.uid());
    RETURN OLD;
  END IF;

  -- UPDATE: only record when something identifying actually changed.
  IF NEW.first_name_en IS DISTINCT FROM OLD.first_name_en
  OR NEW.last_name_en  IS DISTINCT FROM OLD.last_name_en
  OR NEW.first_name_ar IS DISTINCT FROM OLD.first_name_ar
  OR NEW.last_name_ar  IS DISTINCT FROM OLD.last_name_ar
  OR NEW.phone         IS DISTINCT FROM OLD.phone
  OR NEW.email         IS DISTINCT FROM OLD.email
  OR NEW.patient_code  IS DISTINCT FROM OLD.patient_code
  OR NEW.branch_id     IS DISTINCT FROM OLD.branch_id
  OR NEW.deleted_at    IS DISTINCT FROM OLD.deleted_at
  THEN
    v_old := jsonb_build_object(
      'patient_code', OLD.patient_code,
      'name_en', trim(concat_ws(' ', OLD.first_name_en, OLD.last_name_en)),
      'name_ar', trim(concat_ws(' ', OLD.first_name_ar, OLD.last_name_ar)),
      'phone', OLD.phone, 'email', OLD.email,
      'branch_id', OLD.branch_id, 'deleted_at', OLD.deleted_at);
    v_new := jsonb_build_object(
      'patient_code', NEW.patient_code,
      'name_en', trim(concat_ws(' ', NEW.first_name_en, NEW.last_name_en)),
      'name_ar', trim(concat_ws(' ', NEW.first_name_ar, NEW.last_name_ar)),
      'phone', NEW.phone, 'email', NEW.email,
      'branch_id', NEW.branch_id, 'deleted_at', NEW.deleted_at);

    PERFORM public._audit_write('patient', NEW.id,
      CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'soft_delete'
           WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
           ELSE 'update' END,
      v_old, v_new, NEW.branch_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_audit_patients ON public.patients;
CREATE TRIGGER trg_audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_patients();

-- =====================================================================
-- 4. patient_code was reused after a soft-delete.
--
-- tg_patient_assign_code took MAX(patient_code) FROM patients WHERE deleted_at
-- IS NULL, so deleting a patient freed their number for the next registration.
-- Live consequence: code 1 is currently shared by ten patients, nine deleted --
-- all predating today. Two real problems follow:
--   * a code no longer identifies a patient across history, so any paper record
--     or verbal reference to "patient 1" is ambiguous;
--   * restoring a soft-deleted patient collides with the partial unique index,
--     which is exactly what blocked the recovery earlier today until fresh codes
--     were issued by hand.
--
-- Codes are now monotonic across ALL rows, deleted included, so a number is
-- issued once and never reissued. Existing duplicates are left untouched: they
-- are historical fact, and renumbering real patient records to tidy them would
-- be worse than the inconsistency.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_patient_assign_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  next_code int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('patients_patient_code'));

  IF NEW.patient_code IS NULL OR NEW.patient_code = 0 THEN
    -- Deliberately NOT filtered by deleted_at: a code must never be reissued.
    SELECT COALESCE(MAX(patient_code), 0) + 1
      INTO next_code
      FROM public.patients;

    NEW.patient_code := next_code;
  END IF;

  RETURN NEW;
END;
$fn$;
