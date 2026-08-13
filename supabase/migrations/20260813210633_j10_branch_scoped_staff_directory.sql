-- Security remediation: J-10 (RBAC audit)
--
-- Finding: public.list_doctors() and public.list_therapists(_branch_id uuid)
-- are both SECURITY DEFINER with no branch authorization. list_doctors()
-- returns every doctor's name system-wide with no filtering at all.
-- list_therapists(_branch_id) accepts _branch_id directly from the caller
-- and uses it only as a data filter -- it never verifies the caller has
-- access to that branch via public.user_has_branch_access(). Because both
-- are SECURITY DEFINER, the underlying tables' own RLS never applies to
-- these functions' internal reads. Severity is LOW (names only -- no PHI,
-- no financial data), but both violate the strict branch-isolation pattern
-- enforced everywhere else in the schema.
--
-- Exhaustive consumer sweep (Phase J-10.2) found:
--   * list_doctors() has exactly one confirmed application consumer,
--     src/pages/calendar/CalendarPage.tsx, which calls it with zero
--     arguments to populate a branch-agnostic doctor filter dropdown.
--   * list_therapists(_branch_id) has exactly one confirmed application
--     consumer, src/pages/physio/PhysioCaseDetail.tsx, which passes the
--     currently loaded physio_cases row's own branch_id -- a value the
--     caller has already been proven to have user_has_branch_access() on,
--     because physio_cases_select RLS requires exactly that check to load
--     the case in the first place. Zero internal (database-side) callers
--     were found for either function (no trigger, view, cron job, or other
--     function references either by name).
--
-- Approved remediation:
--
--   1. list_doctors() -- signature, return type, grants, SECURITY DEFINER,
--      owner, language (sql), volatility (STABLE), and search_path are all
--      UNCHANGED. The body is rewritten to add a branch-membership
--      condition to the existing WHERE clause: a doctor is now returned
--      only if the caller is system_owner (existing global-bypass
--      semantics of user_has_branch_access(), reproduced inline since this
--      function takes no branch argument to pass to it) OR the caller
--      shares at least one public.staff_branches row with that doctor.
--      staff_branches (not staff_profiles.branch_id, which is only a
--      single home-branch HR field) is the authoritative multi-branch
--      access mapping already used by user_has_branch_access() and by the
--      existing profiles_select_same_branch RLS policy -- this migration
--      reuses that exact, already-reviewed pattern. A literal admin role
--      receives no unconditional bypass here, consistent with
--      user_has_branch_access()'s own semantics (only system_owner is
--      unconditional). The EXISTS join is inside the WHERE clause and does
--      not fan out the outer profiles/user_roles join, so no duplicate
--      doctor rows are introduced. ORDER BY p.full_name NULLS LAST is
--      unchanged. No application change is required: the calendar's
--      existing zero-argument call is fully compatible.
--
--   2. list_therapists(_branch_id uuid) -- signature, return type, grants,
--      SECURITY DEFINER, owner, and search_path are all UNCHANGED. The
--      existing sp.branch_id = _branch_id filter, the doctor/admin role
--      EXISTS check, the ORDER BY, and the LIMIT 500 are all reproduced
--      byte-for-byte unchanged. One guard clause is added immediately on
--      entry, before the staff_profiles query runs, requiring
--      public.user_has_branch_access(_branch_id) -- the same minimal
--      pattern already applied for J-04 (apply_wallet_tx). This function's
--      original body was LANGUAGE sql, which cannot express a procedural
--      IF/RAISE EXCEPTION guard; to reproduce the exact required error
--      semantics (RAISE EXCEPTION 'Forbidden: no access to branch %'
--      USING ERRCODE = '42501') this migration changes the function's
--      language from sql to plpgsql. This is the only property in this
--      migration that is not preserved byte-for-byte from the original,
--      and is disclosed here because it was required to implement the
--      approved authorization guard rather than an equivalent SQL-only
--      workaround (e.g. forcing a generic type-cast error) that would not
--      carry the correct message or ERRCODE. Volatility (STABLE) is
--      preserved. The confirmed consumer (PhysioCaseDetail.tsx) always
--      supplies an already-authorized branch id, so this guard is a
--      provable no-op for that call site and will not raise for it.
--
-- Not touched by this migration: has_role(), user_has_branch_access(), any
-- user_has_branch_access_via_* function (J-14), any RLS policy, any
-- trigger, any application code, any grant, role_permissions/authz_*, or
-- any previously completed J-01/J-03/J-04/J-06..J-09/J-12/J-13/J-15/E-01/
-- H-01/H1-01/H1-01-S/retired-staff-role work.

CREATE OR REPLACE FUNCTION public.list_doctors()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name
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
  ORDER BY p.full_name NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.list_therapists(_branch_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Forbidden: no access to branch %', _branch_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT sp.id, COALESCE(p.full_name, sp.employee_id, sp.id::text) AS full_name
  FROM public.staff_profiles sp
  LEFT JOIN public.profiles p ON p.id = sp.linked_user_id
  WHERE sp.branch_id = _branch_id
    AND sp.linked_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = sp.linked_user_id
        AND ur.role IN ('doctor'::app_role, 'admin'::app_role)
    )
  ORDER BY 2 NULLS LAST
  LIMIT 500;
END;
$function$;
