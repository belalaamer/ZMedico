-- ZMED-004: prevent duplicate active encounters for the same appointment.
--
-- The Queue and Appointment Detail flows both use a read-then-insert pattern.
-- Without a database invariant, two concurrent tabs/users can both observe
-- "no medical record" and create separate active encounters.
--
-- Fail closed if historical duplicates appear before this migration is applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.medical_records
    WHERE appointment_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY appointment_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one active medical record per appointment: duplicate active rows exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_medical_records_active_appointment
  ON public.medical_records (appointment_id)
  WHERE appointment_id IS NOT NULL
    AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_medical_records_active_appointment IS
  'One non-deleted medical record per appointment; prevents concurrent duplicate encounters.';
