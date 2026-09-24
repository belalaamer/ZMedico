-- Renumber active patients from 1 and keep deleted patients after them.
-- Reset the sequence after the highest assigned code. PostgreSQL sequences
-- cannot be set to zero, so an empty table remains at 1 and uncalled.

UPDATE public.patients
SET patient_code = -patient_code;

WITH ranked_active AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM public.patients
  WHERE deleted_at IS NULL
)
UPDATE public.patients p
SET patient_code = r.rn
FROM ranked_active r
WHERE p.id = r.id;

WITH active_max AS (
  SELECT COALESCE(MAX(patient_code), 0) AS max_code
  FROM public.patients
  WHERE deleted_at IS NULL
), ranked_deleted AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM public.patients
  WHERE deleted_at IS NOT NULL
)
UPDATE public.patients p
SET patient_code = (SELECT max_code FROM active_max) + r.rn
FROM ranked_deleted r
WHERE p.id = r.id;

SELECT setval(
  'public.patient_code_seq',
  GREATEST(COALESCE((SELECT MAX(patient_code) FROM public.patients), 1), 1),
  EXISTS (SELECT 1 FROM public.patients)
);
