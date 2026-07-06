-- Wave 3 Pilot RLS Migration — Rollback
-- Restores the original has_role(admin) ALL policies for the 7 pilot tables.
-- Idempotent and transactional.

BEGIN;

DROP POLICY IF EXISTS et_admin   ON public.email_templates;
DROP POLICY IF EXISTS st_admin   ON public.sms_templates;
DROP POLICY IF EXISTS wt_admin   ON public.whatsapp_templates;
DROP POLICY IF EXISTS spec_admin ON public.medical_specialties;
DROP POLICY IF EXISTS rt_admin   ON public.report_templates;
DROP POLICY IF EXISTS sc_admin   ON public.service_categories;
DROP POLICY IF EXISTS lng_admin  ON public.system_languages;

CREATE POLICY et_admin   ON public.email_templates     FOR ALL TO public
  USING      (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY st_admin   ON public.sms_templates       FOR ALL TO public
  USING      (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY wt_admin   ON public.whatsapp_templates  FOR ALL TO public
  USING      (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY spec_admin ON public.medical_specialties FOR ALL TO public
  USING      (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY rt_admin   ON public.report_templates    FOR ALL TO public
  USING      (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY sc_admin   ON public.service_categories  FOR ALL TO public
  USING      (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY lng_admin  ON public.system_languages    FOR ALL TO public
  USING      (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

COMMIT;
