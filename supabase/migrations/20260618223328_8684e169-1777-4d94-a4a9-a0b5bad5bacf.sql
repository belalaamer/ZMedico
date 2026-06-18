
-- Profiles: remove blanket SELECT, replace with scoped policy
DROP POLICY IF EXISTS profiles_select_all_auth ON public.profiles;

CREATE POLICY profiles_select_same_branch
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.staff_branches sb1
    JOIN public.staff_branches sb2 ON sb1.branch_id = sb2.branch_id
    WHERE sb1.user_id = auth.uid()
      AND sb2.user_id = public.profiles.id
  )
);

-- Reminders: remove SELECT-true policy, replace with role-scoped policy
DROP POLICY IF EXISTS rem_select ON public.reminders;

CREATE POLICY rem_select_scoped
ON public.reminders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR has_role(auth.uid(), 'doctor'::app_role)
);
