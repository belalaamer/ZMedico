-- Wave 3A Batch C: settings.create (2 INSERT policies)
DROP POLICY IF EXISTS "role_permissions insert admin" ON public.role_permissions;
CREATE POLICY "role_permissions insert admin" ON public.role_permissions FOR INSERT TO public WITH CHECK (public.has_permission(auth.uid(), 'settings.create'));

DROP POLICY IF EXISTS "sb_insert_admin" ON public.system_backups;
CREATE POLICY "sb_insert_admin" ON public.system_backups FOR INSERT TO public WITH CHECK (public.has_permission(auth.uid(), 'settings.create'));