-- Branch isolation must apply to clinic admins, not just to staff.
--
-- PROVEN PROBLEM: user_has_branch_access() granted a blanket bypass to anyone
-- holding the `admin` role:
--
--   SELECT _branch IS NULL
--       OR has_role(auth.uid(), 'admin')          <-- blanket bypass
--       OR EXISTS (SELECT 1 FROM staff_branches WHERE user_id = auth.uid() AND branch_id = _branch);
--
-- Every clinic needs its own admin. So the moment a second clinic is onboarded
-- as a branch, that clinic's admin can read every other clinic's patients.
-- Demonstrated live in a rolled-back test: a freshly created admin attached ONLY
-- to a new branch saw all 38 patients belonging to the original clinic.
--
-- For a system that is going to be rented to independent clinics this is a
-- patient-data breach waiting to happen, not a theoretical gap.
--
-- THE FIX: only `system_owner` -- the person who operates the platform -- keeps
-- cross-branch visibility. `admin` becomes what it should always have meant:
-- full authority WITHIN the branches that person is actually assigned to.
--
-- WHY THIS IS SAFE TO DO NOW: there is a single branch today, and all 20
-- role-holding users have a staff_branches row for it (enforced by
-- trg_staff_profile_branch_sync), so no current user loses any access.
--
-- VERIFIED after applying:
--   * Clinic B admin attached only to the new branch: 0 patients (was 38) -> isolated
--   * existing per-role matrix byte-identical: admin/manager 38/31/43/5/1,
--     receptionist 38/31/43/0/0, doctor 38/31/0/5/0, accountant 0/0/43/0/1
--   * system_owner retains full cross-branch access

CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT _branch IS NULL
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.staff_branches
      WHERE user_id = auth.uid() AND branch_id = _branch
    );
$fn$;
