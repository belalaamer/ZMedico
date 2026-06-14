DROP POLICY IF EXISTS "qs_select_authenticated" ON public.queue_settings;
DROP POLICY IF EXISTS "qs_insert_authenticated" ON public.queue_settings;
DROP POLICY IF EXISTS "qs_update_authenticated" ON public.queue_settings;
DROP POLICY IF EXISTS "qs_delete_authenticated" ON public.queue_settings;

CREATE POLICY "qs_select_branch_access" ON public.queue_settings
  FOR SELECT TO authenticated
  USING (public.user_has_branch_access(branch_id));

CREATE POLICY "qs_insert_branch_access" ON public.queue_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_branch_access(branch_id));

CREATE POLICY "qs_update_branch_access" ON public.queue_settings
  FOR UPDATE TO authenticated
  USING (public.user_has_branch_access(branch_id))
  WITH CHECK (public.user_has_branch_access(branch_id));

CREATE POLICY "qs_delete_branch_access" ON public.queue_settings
  FOR DELETE TO authenticated
  USING (public.user_has_branch_access(branch_id));