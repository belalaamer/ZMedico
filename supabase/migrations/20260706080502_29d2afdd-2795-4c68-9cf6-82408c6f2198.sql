-- Wave 3A Batch B: settings.export (6 SELECT policies)
DROP POLICY IF EXISTS "allowed_signup_emails_select_none" ON public.allowed_signup_emails;
CREATE POLICY "allowed_signup_emails_select_none" ON public.allowed_signup_emails FOR SELECT TO public USING (public.has_permission(auth.uid(), 'settings.export'));

DROP POLICY IF EXISTS "al_select_admin" ON public.audit_logs;
CREATE POLICY "al_select_admin" ON public.audit_logs FOR SELECT TO public USING (public.has_permission(auth.uid(), 'settings.export'));

DROP POLICY IF EXISTS "ns_select_admin" ON public.notification_settings;
CREATE POLICY "ns_select_admin" ON public.notification_settings FOR SELECT TO public USING (public.has_permission(auth.uid(), 'settings.export'));

DROP POLICY IF EXISTS "rs_select" ON public.report_schedules;
CREATE POLICY "rs_select" ON public.report_schedules FOR SELECT TO public USING (public.has_permission(auth.uid(), 'settings.export'));

DROP POLICY IF EXISTS "sb_read_admin" ON public.system_backups;
CREATE POLICY "sb_read_admin" ON public.system_backups FOR SELECT TO public USING (public.has_permission(auth.uid(), 'settings.export'));

DROP POLICY IF EXISTS "ual_select_admin" ON public.user_activity_logs;
CREATE POLICY "ual_select_admin" ON public.user_activity_logs FOR SELECT TO public USING (public.has_permission(auth.uid(), 'settings.export'));