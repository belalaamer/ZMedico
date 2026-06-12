
-- =========================================================
-- Audit Log Hardening v1 — replace leaky tg_audit_changes()
-- with per-entity whitelisted SECURITY DEFINER triggers,
-- enforce append-only on audit_logs, add wallet adjustment audit.
-- =========================================================

-- 1) Drop ALL triggers that depend on the leaky tg_audit_changes()
--    (it writes full to_jsonb(NEW/OLD) blobs including PHI/PII).
DROP TRIGGER IF EXISTS audit_invoices            ON public.invoices;
DROP TRIGGER IF EXISTS audit_payments            ON public.payments;
DROP TRIGGER IF EXISTS audit_medical_records     ON public.medical_records;
DROP TRIGGER IF EXISTS audit_prescriptions       ON public.prescriptions;
DROP TRIGGER IF EXISTS audit_patients            ON public.patients;
DROP TRIGGER IF EXISTS audit_user_roles          ON public.user_roles;
DROP TRIGGER IF EXISTS audit_products            ON public.products;
DROP TRIGGER IF EXISTS audit_staff_profiles      ON public.staff_profiles;
DROP TRIGGER IF EXISTS audit_insurance_companies ON public.insurance_companies;

-- 2) Indexes on audit_logs (idempotent).
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx
  ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_branch_idx
  ON public.audit_logs (branch_id, created_at DESC);

-- 3) Append-only enforcement: block UPDATE/DELETE on audit_logs.
CREATE OR REPLACE FUNCTION public._audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (op=%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
DROP TRIGGER IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public._audit_logs_append_only();
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public._audit_logs_append_only();

-- Defense-in-depth: revoke direct write privileges from client roles.
-- (SECURITY DEFINER trigger functions own the inserts.)
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon;

-- 4) Helper: resolve actor and write a single audit row.
CREATE OR REPLACE FUNCTION public._audit_write(
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_old         jsonb,
  p_new         jsonb,
  p_branch_id   uuid,
  p_fallback    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := COALESCE(auth.uid(), p_fallback);
  INSERT INTO public.audit_logs
    (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  VALUES
    (v_actor, p_branch_id, p_action, p_entity_type, p_entity_id, p_old, p_new);
END;
$$;
REVOKE ALL ON FUNCTION public._audit_write(text, uuid, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;

-- =========================================================
-- 5) Per-entity whitelisted trigger functions
-- =========================================================

-- ---- INVOICES ----
CREATE OR REPLACE FUNCTION public.tg_audit_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary_new jsonb;
  v_summary_old jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_summary_new := jsonb_build_object(
      'invoice_number', NEW.invoice_number,
      'patient_id',     NEW.patient_id,
      'status',         NEW.status,
      'total',          NEW.total,
      'paid_amount',    NEW.paid_amount,
      'created_by',     NEW.created_by
    );
    PERFORM public._audit_write('invoice', NEW.id, 'create',
      NULL, v_summary_new, NEW.branch_id, NEW.created_by);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Soft delete takes precedence.
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM public._audit_write('invoice', NEW.id, 'soft_delete',
        jsonb_build_object('status', OLD.status, 'paid_amount', OLD.paid_amount),
        jsonb_build_object('deleted_at', NEW.deleted_at),
        NEW.branch_id, NEW.created_by);
      RETURN NEW;
    END IF;

    -- Any real status change → status_change (no hardcoded subset).
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public._audit_write('invoice', NEW.id, 'status_change',
        jsonb_build_object('status', OLD.status, 'paid_amount', OLD.paid_amount),
        jsonb_build_object('status', NEW.status, 'paid_amount', NEW.paid_amount),
        NEW.branch_id, NEW.created_by);
      RETURN NEW;
    END IF;

    -- Generic update (whitelist fields only; diff totals/paid_amount).
    IF NEW.total IS DISTINCT FROM OLD.total
       OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.insurance_company_id IS DISTINCT FROM OLD.insurance_company_id
       OR NEW.claim_status IS DISTINCT FROM OLD.claim_status THEN
      v_summary_old := jsonb_build_object(
        'total', OLD.total, 'paid_amount', OLD.paid_amount,
        'due_date', OLD.due_date, 'insurance_company_id', OLD.insurance_company_id,
        'claim_status', OLD.claim_status);
      v_summary_new := jsonb_build_object(
        'total', NEW.total, 'paid_amount', NEW.paid_amount,
        'due_date', NEW.due_date, 'insurance_company_id', NEW.insurance_company_id,
        'claim_status', NEW.claim_status);
      PERFORM public._audit_write('invoice', NEW.id, 'update',
        v_summary_old, v_summary_new, NEW.branch_id, NEW.created_by);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_invoices_v2
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_invoices();

-- ---- PAYMENTS ----
CREATE OR REPLACE FUNCTION public.tg_audit_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_write('payment', NEW.id, 'create',
      NULL,
      jsonb_build_object(
        'invoice_id', NEW.invoice_id,
        'patient_id', NEW.patient_id,
        'amount', NEW.amount,
        'payment_method', NEW.payment_method,
        'treasury_id', NEW.treasury_id,
        'received_by', NEW.received_by),
      NEW.branch_id, NEW.received_by);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public._audit_write('payment', NEW.id, 'soft_delete',
      jsonb_build_object('amount', OLD.amount, 'invoice_id', OLD.invoice_id),
      jsonb_build_object('deleted_at', NEW.deleted_at),
      NEW.branch_id, NEW.received_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_payments_v2
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_payments();

-- ---- MEDICAL RECORDS (NO PHI free-text) ----
CREATE OR REPLACE FUNCTION public.tg_audit_medical_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_write('medical_record', NEW.id, 'create',
      NULL,
      jsonb_build_object(
        'patient_id', NEW.patient_id,
        'doctor_id',  NEW.doctor_id,
        'visit_type', NEW.visit_type,
        'visit_date', NEW.visit_date,
        'status',     NEW.status),
      NEW.branch_id, NEW.doctor_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM public._audit_write('medical_record', NEW.id, 'soft_delete',
        jsonb_build_object('status', OLD.status, 'visit_type', OLD.visit_type),
        jsonb_build_object('deleted_at', NEW.deleted_at),
        NEW.branch_id, NEW.doctor_id);
      RETURN NEW;
    END IF;

    -- Only emit update for whitelisted, non-PHI field changes.
    IF NEW.status         IS DISTINCT FROM OLD.status
       OR NEW.visit_type  IS DISTINCT FROM OLD.visit_type
       OR NEW.doctor_id   IS DISTINCT FROM OLD.doctor_id
       OR NEW.specialty_id IS DISTINCT FROM OLD.specialty_id
       OR NEW.follow_up_date IS DISTINCT FROM OLD.follow_up_date THEN
      PERFORM public._audit_write('medical_record', NEW.id, 'update',
        jsonb_build_object(
          'status', OLD.status, 'visit_type', OLD.visit_type,
          'doctor_id', OLD.doctor_id, 'specialty_id', OLD.specialty_id,
          'follow_up_date', OLD.follow_up_date),
        jsonb_build_object(
          'status', NEW.status, 'visit_type', NEW.visit_type,
          'doctor_id', NEW.doctor_id, 'specialty_id', NEW.specialty_id,
          'follow_up_date', NEW.follow_up_date),
        NEW.branch_id, NEW.doctor_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_medical_records_v2
  AFTER INSERT OR UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_medical_records();

-- ---- PRESCRIPTIONS ----
CREATE OR REPLACE FUNCTION public.tg_audit_prescriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_doc := (to_jsonb(NEW) ->> 'doctor_id')::uuid;
    PERFORM public._audit_write('prescription', NEW.id, 'create',
      NULL,
      jsonb_build_object(
        'patient_id', (to_jsonb(NEW) ->> 'patient_id')::uuid,
        'doctor_id',  v_doc,
        'status',     (to_jsonb(NEW) ->> 'status')),
      (to_jsonb(NEW) ->> 'branch_id')::uuid, v_doc);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_doc := (to_jsonb(NEW) ->> 'doctor_id')::uuid;

    IF (to_jsonb(OLD) ->> 'deleted_at') IS NULL
       AND (to_jsonb(NEW) ->> 'deleted_at') IS NOT NULL THEN
      PERFORM public._audit_write('prescription', NEW.id, 'soft_delete',
        jsonb_build_object('status', (to_jsonb(OLD) ->> 'status')),
        jsonb_build_object('deleted_at', (to_jsonb(NEW) ->> 'deleted_at')),
        (to_jsonb(NEW) ->> 'branch_id')::uuid, v_doc);
      RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) ->> 'status') IS DISTINCT FROM (to_jsonb(OLD) ->> 'status') THEN
      PERFORM public._audit_write('prescription', NEW.id, 'status_change',
        jsonb_build_object('status', (to_jsonb(OLD) ->> 'status')),
        jsonb_build_object('status', (to_jsonb(NEW) ->> 'status')),
        (to_jsonb(NEW) ->> 'branch_id')::uuid, v_doc);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_prescriptions_v2
  AFTER INSERT OR UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_prescriptions();

-- ---- WALLET MANUAL ADJUSTMENTS ----
CREATE OR REPLACE FUNCTION public.tg_audit_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only audit manual adjustments (not automatic invoice/payment-linked tx).
  IF TG_OP = 'INSERT' AND NEW.tx_type::text = 'manual_adjustment' THEN
    PERFORM public._audit_write('wallet_transaction', NEW.id, 'manual_adjustment',
      NULL,
      jsonb_build_object(
        'patient_id',    NEW.patient_id,
        'direction',     NEW.direction,
        'amount',        NEW.amount,
        'balance_after', NEW.balance_after,
        'reference_type', NEW.reference_type,
        'reference_id',  NEW.reference_id,
        'created_by',    NEW.created_by),
      NEW.branch_id, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_wallet_tx_v2 ON public.patient_wallet_transactions;
CREATE TRIGGER audit_wallet_tx_v2
  AFTER INSERT ON public.patient_wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_wallet_tx();

-- =========================================================
-- 6) Finally, drop the leaky generic function so it cannot
--    be reattached accidentally to any table.
-- =========================================================
DROP FUNCTION IF EXISTS public.tg_audit_changes();
