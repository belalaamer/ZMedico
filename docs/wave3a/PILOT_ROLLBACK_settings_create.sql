-- Wave 3A rollback for settings.create
BEGIN;
DROP POLICY IF EXISTS "role_permissions insert admin" ON public.role_permissions;
CREATE POLICY "role_permissions insert admin" ON public.role_permissions FOR INSERT TO public WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "sb_insert_admin" ON public.system_backups;
CREATE POLICY "sb_insert_admin" ON public.system_backups FOR INSERT TO public WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
COMMIT;