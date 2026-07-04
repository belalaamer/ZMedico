
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: existing rows where id coincides with an auth user
UPDATE public.staff_profiles sp
   SET linked_user_id = sp.id
 WHERE linked_user_id IS NULL
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = sp.id);

-- Enforce 1:1 (only among active/non-deleted rows)
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_profiles_linked_user
  ON public.staff_profiles(linked_user_id)
  WHERE linked_user_id IS NOT NULL AND deleted_at IS NULL;

-- Update self-access RLS policies to match either id or linked_user_id
DROP POLICY IF EXISTS staff_select_self_or_admin ON public.staff_profiles;
CREATE POLICY staff_select_self_or_admin
  ON public.staff_profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR linked_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS staff_update_self ON public.staff_profiles;
CREATE POLICY staff_update_self
  ON public.staff_profiles
  FOR UPDATE
  USING (id = auth.uid() OR linked_user_id = auth.uid())
  WITH CHECK (id = auth.uid() OR linked_user_id = auth.uid());
