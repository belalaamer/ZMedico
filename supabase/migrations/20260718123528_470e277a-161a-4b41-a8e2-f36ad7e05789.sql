CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  total_users int;
  invite_id uuid;
  invite_role public.app_role;
  invite_full_name text;
  norm_email text := lower(coalesce(new.email, ''));
  assigned_role public.app_role;
  resolved_name text;
begin
  select count(*) into total_users from public.user_roles;

  if total_users > 0 then
    select id, role, full_name
      into invite_id, invite_role, invite_full_name
      from public.allowed_signup_emails
      where lower(email) = norm_email
      limit 1;
    if invite_id is null then
      raise exception 'Sign-up not permitted: % is not pre-authorized by an administrator', new.email
        using errcode = '42501';
    end if;
  end if;

  resolved_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    invite_full_name,
    split_part(new.email,'@',1)
  );

  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    resolved_name,
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );

  if total_users = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    assigned_role := coalesce(invite_role, 'staff'::public.app_role);
    insert into public.user_roles (user_id, role) values (new.id, assigned_role);
    delete from public.allowed_signup_emails where lower(email) = norm_email;
  end if;

  return new;
end;
$function$;