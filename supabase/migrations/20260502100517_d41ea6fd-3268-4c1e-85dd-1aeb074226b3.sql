-- Allowlist of pre-authorized emails (managed by admins)
CREATE TABLE IF NOT EXISTS public.allowed_signup_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.allowed_signup_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage allowlist" ON public.allowed_signup_emails;
CREATE POLICY "admins manage allowlist"
  ON public.allowed_signup_emails
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Replace handle_new_user to block self-registration after bootstrap
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  total_users int;
  is_allowed boolean;
  norm_email text := lower(coalesce(new.email, ''));
begin
  select count(*) into total_users from public.user_roles;

  if total_users > 0 then
    -- Allow only if email was pre-invited by an admin
    select exists (
      select 1 from public.allowed_signup_emails where lower(email) = norm_email
    ) into is_allowed;

    if not is_allowed then
      raise exception 'Sign-up not permitted: % is not pre-authorized by an administrator', new.email
        using errcode = '42501';
    end if;
  end if;

  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );

  if total_users = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'staff');
    -- Consume the invite (one-time use)
    delete from public.allowed_signup_emails where lower(email) = norm_email;
  end if;

  return new;
end;
$function$;