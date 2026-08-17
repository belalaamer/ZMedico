-- Preserve the language/script used when a patient name was entered.
-- Existing rows remain NULL when the original input cannot be proven; the UI
-- falls back to script detection for those rows.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS name_language text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patients_name_language_check'
      AND conrelid = 'public.patients'::regclass
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_name_language_check
      CHECK (name_language IS NULL OR name_language IN ('ar', 'en'));
  END IF;
END $$;

ALTER TABLE public.patients
  ALTER COLUMN name_language SET DEFAULT 'en';

COMMENT ON COLUMN public.patients.name_language IS
  'Original input language for patient identity display; NULL means legacy row with inferred script.';
