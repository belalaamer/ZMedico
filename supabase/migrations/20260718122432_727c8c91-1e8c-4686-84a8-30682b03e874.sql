-- Make has_role treat system_owner as a superset of admin.
-- Every existing RLS policy calls has_role(auth.uid(), 'admin'), so this one
-- change grants system_owner god-mode across the entire database.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        -- system_owner implicitly satisfies every role check
        OR role = 'system_owner'::public.app_role
      )
  );
$$;
