-- Renumber active patients from 1 and keep deleted patients after them.
-- Then reset the sequence so the next new active patient gets max(active)+1,
-- or 1 when there are no active patients.

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
  COALESCE((SELECT MAX(patient_code) FROM public.patients WHERE deleted_at IS NULL), 0),
  true
);
