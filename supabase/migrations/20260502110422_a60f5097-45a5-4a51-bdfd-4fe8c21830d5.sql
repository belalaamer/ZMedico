DROP POLICY IF EXISTS sr_select ON public.saved_reports;
CREATE POLICY sr_select ON public.saved_reports
FOR SELECT TO authenticated
USING ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));