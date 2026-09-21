DROP POLICY IF EXISTS allowlist_branch_admin ON public.allowed_signup_emails;

CREATE POLICY allowlist_branch_admin
ON public.allowed_signup_emails
FOR ALL
TO authenticated
USING (
  has_permission((SELECT auth.uid()), 'settings.edit'::text)
  AND branch_id IS NOT NULL
  AND user_has_branch_access(branch_id)
  AND role <> 'system_owner'::public.app_role
)
WITH CHECK (
  has_permission((SELECT auth.uid()), 'settings.edit'::text)
  AND branch_id IS NOT NULL
  AND user_has_branch_access(branch_id)
  AND role <> 'system_owner'::public.app_role
);

ALTER TABLE public.allowed_signup_emails
  DROP CONSTRAINT IF EXISTS allowed_signup_emails_no_retired_staff;

ALTER TABLE public.allowed_signup_emails
  ADD CONSTRAINT allowed_signup_emails_no_retired_staff
  CHECK (role <> 'staff'::public.app_role);
