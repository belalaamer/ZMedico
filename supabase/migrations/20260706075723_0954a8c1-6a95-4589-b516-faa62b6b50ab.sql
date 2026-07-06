-- Wave 3 Pilot RLS Migration — 7 admin-only ALL policies on config/catalog tables
-- Replaces has_role(auth.uid(),'admin'::app_role) with has_permission(auth.uid(),'settings.edit').
-- Semantically identical: only the 'admin' bundle grants 'settings.edit', and
-- public.has_permission() has an explicit admin bypass.
-- Companion *_select policies (USING true) are intentionally untouched.

DROP POLICY IF EXISTS et_admin   ON public.email_templates;
CREATE POLICY et_admin ON public.email_templates FOR ALL TO public
  USING      (public.has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS st_admin   ON public.sms_templates;
CREATE POLICY st_admin ON public.sms_templates FOR ALL TO public
  USING      (public.has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS wt_admin   ON public.whatsapp_templates;
CREATE POLICY wt_admin ON public.whatsapp_templates FOR ALL TO public
  USING      (public.has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS spec_admin ON public.medical_specialties;
CREATE POLICY spec_admin ON public.medical_specialties FOR ALL TO public
  USING      (public.has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS rt_admin   ON public.report_templates;
CREATE POLICY rt_admin ON public.report_templates FOR ALL TO public
  USING      (public.has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS sc_admin   ON public.service_categories;
CREATE POLICY sc_admin ON public.service_categories FOR ALL TO public
  USING      (public.has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS lng_admin  ON public.system_languages;
CREATE POLICY lng_admin ON public.system_languages FOR ALL TO public
  USING      (public.has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));