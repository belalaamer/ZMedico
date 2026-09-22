DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='invoice_items'
      AND (
        COALESCE(qual,'') LIKE '%auth.uid()%'
        OR COALESCE(with_check,'') LIKE '%auth.uid()%'
      )
  LOOP
    new_qual := CASE WHEN p.qual IS NULL THEN NULL ELSE replace(p.qual,'auth.uid()','(SELECT auth.uid())') END;
    new_check := CASE WHEN p.with_check IS NULL THEN NULL ELSE replace(p.with_check,'auth.uid()','(SELECT auth.uid())') END;
    stmt := format('ALTER POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
    IF new_qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)',new_qual); END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)',new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_booking_confirmed_by ON public.appointments(booking_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_appointments_booking_rejected_by ON public.appointments(booking_rejected_by);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_insurance_rule_id ON public.invoice_items(insurance_rule_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_insurance_company_id ON public.invoices(insurance_company_id);
CREATE INDEX IF NOT EXISTS idx_patients_created_by ON public.patients(created_by);
CREATE INDEX IF NOT EXISTS idx_patients_insurance_company_id ON public.patients(insurance_company_id);
CREATE INDEX IF NOT EXISTS idx_patients_referred_by_patient_id ON public.patients(referred_by_patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_received_by ON public.payments(received_by);
CREATE INDEX IF NOT EXISTS idx_payments_treasury_id ON public.payments(treasury_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_position_id ON public.staff_profiles(position_id);
