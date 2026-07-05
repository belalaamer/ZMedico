
DROP POLICY IF EXISTS qa_insert_branch_access ON public.queue_alerts;
DROP POLICY IF EXISTS qa_update_branch_access ON public.queue_alerts;
DROP POLICY IF EXISTS qa_delete_branch_access ON public.queue_alerts;

CREATE POLICY qa_insert_manager ON public.queue_alerts
FOR INSERT TO authenticated
WITH CHECK (
  user_has_branch_access(branch_id)
  AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
);

CREATE POLICY qa_update_manager ON public.queue_alerts
FOR UPDATE TO authenticated
USING (
  user_has_branch_access(branch_id)
  AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
)
WITH CHECK (
  user_has_branch_access(branch_id)
  AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
);

CREATE POLICY qa_delete_admin ON public.queue_alerts
FOR DELETE TO authenticated
USING (
  user_has_branch_access(branch_id)
  AND has_role(auth.uid(),'admin'::app_role)
);
