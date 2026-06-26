
-- 1) Soft delete columns
ALTER TABLE public.physio_cases          ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.physio_sessions       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.physio_reassessments  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Unique session_number per active case (partial unique excluding soft-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS uq_physio_sessions_case_number_active
  ON public.physio_sessions(case_id, session_number)
  WHERE deleted_at IS NULL;

-- 3) Tighten write policies: branch access + clinical role (admin/doctor).
-- Cases
DROP POLICY IF EXISTS "physio_cases_insert" ON public.physio_cases;
DROP POLICY IF EXISTS "physio_cases_update" ON public.physio_cases;
DROP POLICY IF EXISTS "physio_cases_delete" ON public.physio_cases;
CREATE POLICY "physio_cases_insert_clinical" ON public.physio_cases FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'doctor'::public.app_role))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id))
  );
CREATE POLICY "physio_cases_update_clinical" ON public.physio_cases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id))
  WITH CHECK (
    (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'doctor'::public.app_role))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id))
  );
CREATE POLICY "physio_cases_delete_admin" ON public.physio_cases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- Sessions
DROP POLICY IF EXISTS "physio_sessions_insert" ON public.physio_sessions;
DROP POLICY IF EXISTS "physio_sessions_update" ON public.physio_sessions;
DROP POLICY IF EXISTS "physio_sessions_delete" ON public.physio_sessions;
CREATE POLICY "physio_sessions_insert_clinical" ON public.physio_sessions FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'doctor'::public.app_role))
    AND public.user_has_branch_access_via_physio_case(case_id)
  );
CREATE POLICY "physio_sessions_update_clinical" ON public.physio_sessions FOR UPDATE TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id))
  WITH CHECK (
    (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'doctor'::public.app_role))
    AND public.user_has_branch_access_via_physio_case(case_id)
  );
CREATE POLICY "physio_sessions_delete_admin" ON public.physio_sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- Reassessments
DROP POLICY IF EXISTS "physio_reassessments_insert" ON public.physio_reassessments;
DROP POLICY IF EXISTS "physio_reassessments_update" ON public.physio_reassessments;
DROP POLICY IF EXISTS "physio_reassessments_delete" ON public.physio_reassessments;
CREATE POLICY "physio_reassessments_insert_clinical" ON public.physio_reassessments FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'doctor'::public.app_role))
    AND public.user_has_branch_access_via_physio_case(case_id)
  );
CREATE POLICY "physio_reassessments_update_clinical" ON public.physio_reassessments FOR UPDATE TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id))
  WITH CHECK (
    (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'doctor'::public.app_role))
    AND public.user_has_branch_access_via_physio_case(case_id)
  );
CREATE POLICY "physio_reassessments_delete_admin" ON public.physio_reassessments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- 4) Audit triggers (create / status_change / soft_delete) using existing _audit_write helper.
CREATE OR REPLACE FUNCTION public.tg_audit_physio_cases()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_write('physio_case', NEW.id, 'create',
      NULL,
      jsonb_build_object(
        'patient_id', NEW.patient_id,
        'therapist_id', NEW.therapist_id,
        'status', NEW.status,
        'start_date', NEW.start_date,
        'expected_sessions', NEW.expected_sessions),
      NEW.branch_id, NEW.created_by);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      PERFORM public._audit_write('physio_case', NEW.id, 'soft_delete',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('deleted_at', NEW.deleted_at),
        NEW.branch_id, NEW.created_by);
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public._audit_write('physio_case', NEW.id, 'status_change',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        NEW.branch_id, NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_audit_physio_child()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b uuid;
BEGIN
  SELECT branch_id INTO b FROM public.physio_cases WHERE id = NEW.case_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_write(TG_ARGV[0], NEW.id, 'create',
      NULL,
      jsonb_build_object('case_id', NEW.case_id),
      b, NEW.created_by);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public._audit_write(TG_ARGV[0], NEW.id, 'soft_delete',
      NULL,
      jsonb_build_object('deleted_at', NEW.deleted_at),
      b, NEW.created_by);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_physio_cases ON public.physio_cases;
CREATE TRIGGER trg_audit_physio_cases
  AFTER INSERT OR UPDATE ON public.physio_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_physio_cases();

DROP TRIGGER IF EXISTS trg_audit_physio_sessions ON public.physio_sessions;
CREATE TRIGGER trg_audit_physio_sessions
  AFTER INSERT OR UPDATE ON public.physio_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_physio_child('physio_session');

DROP TRIGGER IF EXISTS trg_audit_physio_reassessments ON public.physio_reassessments;
CREATE TRIGGER trg_audit_physio_reassessments
  AFTER INSERT OR UPDATE ON public.physio_reassessments
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_physio_child('physio_reassessment');

REVOKE EXECUTE ON FUNCTION public.tg_audit_physio_cases() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_audit_physio_child() FROM PUBLIC, anon;

-- 5) Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.physio_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.physio_reassessments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.physio_cases;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
