-- Wave 3A rollback for settings.delete
BEGIN;
DROP POLICY IF EXISTS "role_permissions delete admin" ON public.role_permissions;
CREATE POLICY "role_permissions delete admin" ON public.role_permissions FOR DELETE TO public USING (has_role(auth.uid(), 'admin'::app_role));
COMMIT;