-- Add phone2, blood_type, deleted_at to patients; relax name nullability
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS phone2 text,
  ADD COLUMN IF NOT EXISTS blood_type text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.patients ALTER COLUMN first_name_en DROP NOT NULL;

CREATE INDEX IF NOT EXISTS patients_deleted_at_idx ON public.patients (deleted_at);