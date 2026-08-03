-- Package A / Fix 1: restore data access for all staff.
--
-- Root cause: every branch-scoped table carries a RESTRICTIVE policy named
-- `branch_isolation` using user_has_branch_access(), which requires a
-- staff_branches row. Only 2 of 20 users had one, and 0 rows in
-- patients/appointments/invoices have a NULL branch_id. Every non-admin user
-- therefore read ZERO rows from ~31 tables, with no error shown.
--
-- Safe: INSERT-only. No existing row is modified or deleted. No RLS policy,
-- helper function or authz_* table is touched.
-- staff_branches PK is (user_id, branch_id) so ON CONFLICT DO NOTHING is exact.
--
-- Applied to the live database on 2026-08-03 as migration 20260803085320.
-- Idempotent: safe to re-run.

-- 1) Backfill from the already-correct staff_profiles data.
INSERT INTO public.staff_branches (user_id, branch_id)
SELECT sp.linked_user_id, sp.branch_id
FROM public.staff_profiles sp
WHERE sp.linked_user_id IS NOT NULL
  AND sp.branch_id IS NOT NULL
  AND sp.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 2) Safety net: any user holding a role but still unattached gets the main branch.
--    NOTE: safe today because exactly one branch exists. Revisit when a second
--    branch is added, so new staff are not auto-attached to the wrong branch.
INSERT INTO public.staff_branches (user_id, branch_id)
SELECT DISTINCT ur.user_id, b.id
FROM public.user_roles ur
CROSS JOIN public.branches b
WHERE b.is_main_branch = true
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_branches sb WHERE sb.user_id = ur.user_id
  )
ON CONFLICT DO NOTHING;

-- 3) Prevent recurrence: keep staff_branches in sync with staff_profiles.
CREATE OR REPLACE FUNCTION public.tg_sync_staff_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.linked_user_id IS NOT NULL
     AND NEW.branch_id IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.staff_branches (user_id, branch_id)
    VALUES (NEW.linked_user_id, NEW.branch_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_profile_branch_sync ON public.staff_profiles;
CREATE TRIGGER trg_staff_profile_branch_sync
AFTER INSERT OR UPDATE OF branch_id, linked_user_id
ON public.staff_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_staff_branch();
