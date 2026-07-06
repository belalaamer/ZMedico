-- Wave 3A Batch D: settings.delete (1 DELETE policy)
DROP POLICY IF EXISTS "role_permissions delete admin" ON public.role_permissions;
CREATE POLICY "role_permissions delete admin" ON public.role_permissions FOR DELETE TO public USING (public.has_permission(auth.uid(), 'settings.delete'));