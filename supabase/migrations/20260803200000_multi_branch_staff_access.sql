-- Make branch scoping multi-branch aware.
--
-- DECISION (clinic owner, 2026-08-03): a staff member may work in ONE branch or
-- in SEVERAL. The data model already supports this via staff_branches
-- (many-to-many), and the RESTRICTIVE `branch_isolation` policies correctly use
-- user_has_branch_access(), which reads staff_branches.
--
-- The gap: 20 PERMISSIVE policies compared against current_user_branch_id(),
-- which returns a SINGLE branch (the first row of staff_profiles):
--
--   SELECT branch_id FROM staff_profiles
--   WHERE linked_user_id = auth.uid() AND deleted_at IS NULL
--   ORDER BY (status = 'active') DESC NULLS LAST, created_at ASC
--   LIMIT 1
--
-- Consequence: a manager assigned to branches A and B matched the permissive
-- policy only for whichever branch sorted first, and silently saw zero rows for
-- the other one. With one branch this is invisible; it would break on the day a
-- second branch is created.
--
-- Fix: rewrite every `<col> = current_user_branch_id()` comparison as
-- `user_has_branch_access(<col>)`, so those policies consult staff_branches like
-- the rest of the system. user_has_branch_access() also returns true for a NULL
-- branch and for admins, matching the previous `branch_id IS NULL OR ...` shape.
--
-- Applied as a verified transformation rather than 20 hand-written policies:
-- each policy expression is read from the catalogue, rewritten by regex and
-- re-applied. If the regex fails to change any policy, or the count is not
-- exactly 20, the whole migration aborts rather than leaving a partial state.
--
-- Applied live 2026-08-03. Verified afterwards: zero policies still reference
-- current_user_branch_id(), and the per-role read matrix (patients, appointments,
-- invoices, medical_records, expenses, treasury) was byte-identical to before,
-- confirming no access was lost and none was widened.

DO $$
DECLARE
  r RECORD;
  v_qual text;
  v_check text;
  v_sql text;
  v_changed int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%current_user_branch_id%'
    ORDER BY tablename, policyname
  LOOP
    v_qual  := regexp_replace(r.qual,       '([a-zA-Z0-9_\.]+)\s*=\s*current_user_branch_id\(\)', 'user_has_branch_access(\1)', 'g');
    v_check := regexp_replace(r.with_check, '([a-zA-Z0-9_\.]+)\s*=\s*current_user_branch_id\(\)', 'user_has_branch_access(\1)', 'g');

    IF COALESCE(v_qual,'') LIKE '%current_user_branch_id%'
       OR COALESCE(v_check,'') LIKE '%current_user_branch_id%' THEN
      RAISE EXCEPTION 'Rewrite failed for policy %.% -- expression still single-branch, aborting', r.tablename, r.policyname;
    END IF;

    v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
    v_changed := v_changed + 1;
  END LOOP;

  -- Idempotency note: on a re-run there are no matching policies left, so
  -- v_changed is 0. Only enforce the count on the first (transforming) run.
  IF v_changed <> 0 AND v_changed <> 20 THEN
    RAISE EXCEPTION 'Expected to rewrite 20 policies, rewrote % -- aborting so the change is not partial', v_changed;
  END IF;

  RAISE NOTICE 'Rewrote % policies to be multi-branch aware', v_changed;
END $$;
