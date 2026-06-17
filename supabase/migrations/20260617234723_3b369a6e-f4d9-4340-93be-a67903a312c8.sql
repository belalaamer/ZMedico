
-- Phase 14: Branch-scoped RLS on queue_alerts + enable realtime

DROP POLICY IF EXISTS "Authenticated can view branch alerts" ON public.queue_alerts;
DROP POLICY IF EXISTS "Authenticated can insert branch alerts" ON public.queue_alerts;
DROP POLICY IF EXISTS "Authenticated can update branch alerts" ON public.queue_alerts;
DROP POLICY IF EXISTS "Authenticated can delete branch alerts" ON public.queue_alerts;

CREATE POLICY "qa_select_branch_access" ON public.queue_alerts
  FOR SELECT TO authenticated
  USING (public.user_has_branch_access(branch_id));

CREATE POLICY "qa_insert_branch_access" ON public.queue_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_branch_access(branch_id));

CREATE POLICY "qa_update_branch_access" ON public.queue_alerts
  FOR UPDATE TO authenticated
  USING (public.user_has_branch_access(branch_id))
  WITH CHECK (public.user_has_branch_access(branch_id));

CREATE POLICY "qa_delete_branch_access" ON public.queue_alerts
  FOR DELETE TO authenticated
  USING (public.user_has_branch_access(branch_id));

-- Enable realtime broadcasting for alert state changes.
ALTER TABLE public.queue_alerts REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_alerts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
