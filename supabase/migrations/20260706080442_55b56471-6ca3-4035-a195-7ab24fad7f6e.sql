-- Wave 3A Batch A: settings.edit (20 policies)
DROP POLICY IF EXISTS "admins manage allowlist" ON public.allowed_signup_emails;
CREATE POLICY "admins manage allowlist" ON public.allowed_signup_emails FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "as_admin" ON public.appointment_settings;
CREATE POLICY "as_admin" ON public.appointment_settings FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "authz_bundle_implies admin write" ON public.authz_bundle_implies;
CREATE POLICY "authz_bundle_implies admin write" ON public.authz_bundle_implies FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "authz_bundle_permissions admin write" ON public.authz_bundle_permissions;
CREATE POLICY "authz_bundle_permissions admin write" ON public.authz_bundle_permissions FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "authz_bundles admin write" ON public.authz_bundles;
CREATE POLICY "authz_bundles admin write" ON public.authz_bundles FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "authz_permissions admin write" ON public.authz_permissions;
CREATE POLICY "authz_permissions admin write" ON public.authz_permissions FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "authz_role_bundles admin write" ON public.authz_role_bundles;
CREATE POLICY "authz_role_bundles admin write" ON public.authz_role_bundles FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "branches_admin_all" ON public.branches;
CREATE POLICY "branches_admin_all" ON public.branches FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "cp_admin" ON public.clinic_profile;
CREATE POLICY "cp_admin" ON public.clinic_profile FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "cs_admin" ON public.clinic_settings;
CREATE POLICY "cs_admin" ON public.clinic_settings FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "dept_admin" ON public.departments;
CREATE POLICY "dept_admin" ON public.departments FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "ns_admin" ON public.notification_settings;
CREATE POLICY "ns_admin" ON public.notification_settings FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "rs_admin" ON public.report_schedules;
CREATE POLICY "rs_admin" ON public.report_schedules FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "role_permissions update admin" ON public.role_permissions;
CREATE POLICY "role_permissions update admin" ON public.role_permissions FOR UPDATE TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "sv_admin" ON public.services;
CREATE POLICY "sv_admin" ON public.services FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "pos_admin" ON public.staff_positions;
CREATE POLICY "pos_admin" ON public.staff_positions FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "staff_admin" ON public.staff_profiles;
CREATE POLICY "staff_admin" ON public.staff_profiles FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "tenants_admin_all" ON public.tenants;
CREATE POLICY "tenants_admin_all" ON public.tenants FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "roles_admin_manage" ON public.user_roles;
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));

DROP POLICY IF EXISTS "ws_admin" ON public.work_schedules;
CREATE POLICY "ws_admin" ON public.work_schedules FOR ALL TO public USING (public.has_permission(auth.uid(), 'settings.edit')) WITH CHECK (public.has_permission(auth.uid(), 'settings.edit'));