-- Two-phase renumber to avoid unique constraint collisions
-- Phase 1: move all to negative space
UPDATE public.patients SET patient_code = -patient_code;

-- Phase 2a: assign 1..N to active patients ordered by created_at
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.patients
  WHERE deleted_at IS NULL
)
UPDATE public.patients p
SET patient_code = r.rn
FROM ranked r
WHERE p.id = r.id;

-- Phase 2b: assign continuing numbers to soft-deleted patients
WITH active_max AS (
  SELECT COALESCE(MAX(patient_code), 0) AS m FROM public.patients WHERE deleted_at IS NULL
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.patients
  WHERE deleted_at IS NOT NULL
)
UPDATE public.patients p
SET patient_code = (SELECT m FROM active_max) + r.rn
FROM ranked r
WHERE p.id = r.id;

-- Reset sequence to one past the current max
SELECT setval('patient_code_seq', COALESCE((SELECT MAX(patient_code) FROM public.patients), 0));
