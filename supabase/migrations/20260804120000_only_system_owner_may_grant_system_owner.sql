-- Close a privilege-escalation hole: an admin could make themselves system_owner.
--
-- PROVEN, live (rolled back), acting as a real admin user:
--   INSERT INTO user_roles (user_id, role) VALUES (self, 'system_owner')      -> ACCEPTED
--   INSERT INTO allowed_signup_emails (email, role) VALUES (x,'system_owner')  -> ACCEPTED
--
-- Why the earlier review missed it: the write policy on user_roles requires
-- has_permission(auth.uid(),'settings.edit'), and that was read as "admins only",
-- which is true. The gap is that it does not constrain WHICH role may be granted.
-- An admin holds settings.edit, so an admin could grant any role to anyone,
-- including system_owner to themselves.
--
-- Why this is now critical rather than merely untidy: migration
-- 20260804110000 made system_owner the ONLY role that crosses branch
-- boundaries, so that clinics rented on one deployment stay isolated. This hole
-- let any clinic's admin self-promote and read every other clinic's patients,
-- defeating that isolation entirely.
--
-- FIX: system_owner may only be granted, modified or revoked by an existing
-- system_owner. Admins keep full control over every other role, which is what
-- running their own clinic requires.
--
-- VERIFIED after applying, as a real admin and a real system_owner:
--   A) admin self-grants system_owner        -> BLOCKED
--   B) admin invites a system_owner          -> BLOCKED
--   C) admin grants an ordinary role         -> still works
--   D) system_owner invites a system_owner   -> still works

-- 1) user_roles: writes still need settings.edit, but system_owner rows are
--    reserved to system owners.
ALTER POLICY roles_admin_manage ON public.user_roles
  USING (
    has_permission(auth.uid(), 'settings.edit'::text)
    AND (
      role <> 'system_owner'::public.app_role
      OR has_role(auth.uid(), 'system_owner'::public.app_role)
    )
  )
  WITH CHECK (
    has_permission(auth.uid(), 'settings.edit'::text)
    AND (
      role <> 'system_owner'::public.app_role
      OR has_role(auth.uid(), 'system_owner'::public.app_role)
    )
  );

-- 2) allowed_signup_emails: the same restriction on the invite path, otherwise
--    an admin simply invites a new system_owner instead of granting one.
CREATE OR REPLACE FUNCTION public.tg_guard_system_owner_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.role = 'system_owner'::public.app_role
     AND NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'Only a system_owner may invite another system_owner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_system_owner_invite ON public.allowed_signup_emails;
CREATE TRIGGER trg_guard_system_owner_invite
  BEFORE INSERT OR UPDATE OF role ON public.allowed_signup_emails
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_system_owner_invite();
