-- Store localized doctor names separately from the legacy display name.
-- Existing profiles are backfilled only when their script is unambiguous; the
-- legacy full_name remains as a safe fallback for rows that cannot be translated.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name_en text,
  ADD COLUMN IF NOT EXISTS full_name_ar text;

UPDATE public.profiles
SET full_name_ar = COALESCE(full_name_ar, full_name),
    full_name_en = COALESCE(full_name_en, NULL)
WHERE full_name IS NOT NULL
  AND full_name ~ '[\u0600-\u06FF]';

UPDATE public.profiles
SET full_name_en = COALESCE(full_name_en, full_name),
    full_name_ar = COALESCE(full_name_ar, NULL)
WHERE full_name IS NOT NULL
  AND full_name !~ '[\u0600-\u06FF]';

DROP FUNCTION IF EXISTS public.list_doctors();

CREATE FUNCTION public.list_doctors()
RETURNS TABLE(id uuid, full_name text, full_name_en text, full_name_ar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.full_name_en, p.full_name_ar
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'doctor'::app_role
    AND (
      public.has_role(auth.uid(), 'system_owner'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.staff_branches caller_branch
        JOIN public.staff_branches doctor_branch
          ON doctor_branch.branch_id = caller_branch.branch_id
        WHERE caller_branch.user_id = auth.uid()
          AND doctor_branch.user_id = p.id
      )
    )
  ORDER BY COALESCE(p.full_name_en, p.full_name_ar, p.full_name) NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.list_doctors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_doctors() TO authenticated, service_role;
