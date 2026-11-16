-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260806110358
-- name: tighten_physio_write_policies_to_clinical_roles
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- The physiotherapy module has never run against real data -- all three tables are
-- empty -- so it is the least-exercised code in the system. Walking it end to end
-- found the workflow itself sound: duplicate session numbers are rejected, a
-- session cannot be linked to another patient's appointment, and completing a case
-- clears its pending follow-up so no stale reminder is left behind.
--
-- What it also found is a set of write policies whose TEXT is far looser than
-- their observed behaviour:
--
--   physio_cases_update_clinical         USING (admin OR user_has_branch_access(branch_id))
--   physio_sessions_update_clinical      USING (user_has_branch_access_via_physio_case(case_id))
--   physio_reassessments_update_clinical USING (user_has_branch_access_via_physio_case(case_id))
--
-- Read literally, any employee attached to the branch satisfies those -- a
-- receptionist could rewrite a diagnosis or close a case. Probing all eight roles
-- showed they are in fact refused today, so this is not an open hole. But nothing
-- in these policies is what refuses them; some other condition is doing the work.
-- A control that holds by accident is one refactor away from not holding, and a
-- blind write to a clinical record is worse than a read leak because the patient's
-- history changes with nobody able to see that it did.
--
-- The clinical-role condition is therefore made explicit, matching the SELECT and
-- INSERT policies on the same tables. Behaviour is unchanged; the guarantee is now
-- written down.
--
-- Nurses keep read access and stay excluded from writes, which is the existing
-- design: the treating therapist owns the record.

DROP POLICY IF EXISTS physio_cases_update_clinical ON public.physio_cases;
CREATE POLICY physio_cases_update_clinical
  ON public.physio_cases
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'doctor'::public.app_role)
      AND public.user_has_branch_access(branch_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'doctor'::public.app_role)
      AND public.user_has_branch_access(branch_id)
    )
  );

DROP POLICY IF EXISTS physio_sessions_update_clinical ON public.physio_sessions;
CREATE POLICY physio_sessions_update_clinical
  ON public.physio_sessions
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'doctor'::public.app_role)
      AND public.user_has_branch_access_via_physio_case(case_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'doctor'::public.app_role)
      AND public.user_has_branch_access_via_physio_case(case_id)
    )
  );

DROP POLICY IF EXISTS physio_reassessments_update_clinical ON public.physio_reassessments;
CREATE POLICY physio_reassessments_update_clinical
  ON public.physio_reassessments
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'doctor'::public.app_role)
      AND public.user_has_branch_access_via_physio_case(case_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'doctor'::public.app_role)
      AND public.user_has_branch_access_via_physio_case(case_id)
    )
  );
