-- Split ns_admin (FOR ALL) into narrow UPDATE/INSERT/DELETE policies so SELECT stays admin-only via ns_select_admin.
DROP POLICY IF EXISTS ns_admin ON public.notification_settings;

CREATE POLICY ns_admin_update ON public.notification_settings
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'settings.edit'))
  WITH CHECK (has_permission(auth.uid(), 'settings.edit'));

CREATE POLICY ns_admin_insert ON public.notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'settings.edit'));

CREATE POLICY ns_admin_delete ON public.notification_settings
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'settings.edit'));