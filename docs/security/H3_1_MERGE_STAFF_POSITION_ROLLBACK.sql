-- Rollback for Security Hotfix H3-1 (merge_staff_position).
-- Restores the pre-hotfix body verbatim. Grants are unchanged.
CREATE OR REPLACE FUNCTION public.merge_staff_position(source_id uuid, target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF source_id = target_id THEN RETURN; END IF;
  UPDATE public.staff_profiles SET position_id = target_id WHERE position_id = source_id;
  UPDATE public.staff_positions
    SET deleted_at = now()
    WHERE id = source_id AND deleted_at IS NULL;
END;
$function$;