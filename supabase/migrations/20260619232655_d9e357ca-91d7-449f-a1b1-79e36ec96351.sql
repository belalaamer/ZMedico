
-- Normalize staff_positions (canonical jobs/roles)
ALTER TABLE public.staff_positions
  ADD COLUMN IF NOT EXISTS group_key text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill group_key from linked department name (English), fallback "general"
UPDATE public.staff_positions sp
SET group_key = COALESCE(
  NULLIF(TRIM(LOWER((SELECT d.name_en FROM public.departments d WHERE d.id = sp.department_id))), ''),
  'general'
)
WHERE sp.group_key IS NULL;

-- Prevent future duplicates (case/space-insensitive) among active rows
CREATE UNIQUE INDEX IF NOT EXISTS staff_positions_unique_title_en_active
  ON public.staff_positions (LOWER(TRIM(title_en)))
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_positions_unique_title_ar_active
  ON public.staff_positions (LOWER(TRIM(title_ar)))
  WHERE deleted_at IS NULL;

-- Merge helper: reassigns staff_profiles and soft-deletes the source
CREATE OR REPLACE FUNCTION public.merge_staff_position(source_id uuid, target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF source_id = target_id THEN RETURN; END IF;
  UPDATE public.staff_profiles SET position_id = target_id WHERE position_id = source_id;
  UPDATE public.staff_positions
    SET deleted_at = now()
    WHERE id = source_id AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_staff_position(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_staff_position(uuid, uuid) TO authenticated;
