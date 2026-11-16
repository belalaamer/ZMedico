-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260806074331
-- name: close_two_empty_screens_reminders_and_accountant_calendar
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Two screens opened and returned nothing. Cross-referencing every route against
-- real row access found exactly these two, and they need opposite fixes.
--
-- 1. NURSE could open /reminders and see nothing.
--    rem_select_scoped allowed admin, manager, receptionist and doctor. Excluding
--    the nurse while including the doctor is arbitrary: a nurse works the same
--    appointments for the same patients and is expected to handle the same
--    patient contact. This is a missing privilege, so it is granted.
--
-- 2. ACCOUNTANT could open /reminders, /calendar, /queue and the appointment
--    detail, and see nothing useful.
--    The cause is mine. Yesterday the accountant had no appointment access and the
--    bundle declared appointments.view, so I widened RLS to match the bundle. That
--    was the wrong direction to reconcile them. An accountant does not need the
--    appointment book: they work from the invoice, which carries the patient and
--    the amount, and invoices link to medical_record_id -- not to appointments --
--    so nothing in the billing path depends on it. Under minimum necessary
--    (HIPAA 164.502(b), GDPR 5(1)(c)) the narrower original was right, so the
--    bundle is corrected down instead of RLS being widened up.
--
--    The accountant keeps patients.view, which IS justified: they must know whose
--    invoice they are collecting, and the invoices screen joins to patients.
--    Appointment reminders carry a patient's phone number and message content,
--    which a finance role has no reason to read.
--
-- Consequence to expect: appointment counters on the accountant's dashboard will
-- read zero. That is correct -- the same is already true for hr -- and an empty
-- widget is honest, whereas a screen that opens onto nothing is not.

-- ---- 1. nurse gains reminders ----
DROP POLICY IF EXISTS rem_select_scoped ON public.reminders;
CREATE POLICY rem_select_scoped
  ON public.reminders
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR public.has_role(auth.uid(), 'doctor'::public.app_role)
      OR public.has_role(auth.uid(), 'nurse'::public.app_role)   -- added
    )
    AND public.user_has_branch_access(branch_id)
  );

-- ---- 2. accountant loses the appointment book, in both models and in RLS ----
DELETE FROM public.authz_bundle_permissions
WHERE bundle_key = 'bundle.role.accountant'
  AND permission_key IN ('appointments.view');

UPDATE public.role_permissions
   SET actions = '{}'
 WHERE role = 'accountant' AND module = 'appointments';

DROP POLICY IF EXISTS appts_select_scoped ON public.appointments;
CREATE POLICY appts_select_scoped
  ON public.appointments
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'doctor'::public.app_role)
      OR public.has_role(auth.uid(), 'nurse'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      -- 'accountant' removed: no need for the schedule, and it was only ever
      -- added to match a bundle grant that itself was too broad
      -- 'hr' remains removed, as decided yesterday
    )
    AND public.user_has_branch_access(branch_id)
  );
