-- ZMED-274 / SEC-SEC-01: restrict arbitrary-target has_role/has_permission probes.
-- Guarded wrappers allow: self, service_role JWT context, direct DB admin sessions,
-- system_owner callers, and callers holding the 'settings.edit' permission (needed by
-- hr_manage_staff_user_link's last-owner check on p_new_user_id). All RLS policies call
-- has_role(auth.uid(), ...) / has_permission(auth.uid(), ...) and keep working unchanged.
-- Core bodies are byte-for-byte the previous public semantics.

create or replace function public._has_role_core(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

create or replace function public._has_permission_core(_user_id uuid, _permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  SELECT
    _user_id IS NOT NULL
    AND _permission_key IS NOT NULL
    AND (
      public._has_role_core(_user_id, 'admin'::public.app_role)
      OR EXISTS (
        WITH RECURSIVE user_bundles AS (
          SELECT rb.bundle_key
            FROM public.user_roles ur
            JOIN public.authz_role_bundles rb ON rb.role = ur.role
           WHERE ur.user_id = _user_id
          UNION
          SELECT bi.child_bundle_key
            FROM user_bundles ub
            JOIN public.authz_bundle_implies bi ON bi.parent_bundle_key = ub.bundle_key
        )
        SELECT 1
          FROM user_bundles ub
          JOIN public.authz_bundle_permissions bp ON bp.bundle_key = ub.bundle_key
          JOIN public.authz_permissions p
            ON p.key = bp.permission_key AND NOT p.deprecated
         WHERE bp.permission_key = _permission_key
      )
    )
$$;

create or replace function public._authz_probe_allowed(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  SELECT _user_id IS NOT NULL AND (
    _user_id = auth.uid()
    OR coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
    OR session_user IN ('supabase_admin', 'postgres', 'postgres_role')
    OR public._has_role_core(auth.uid(), 'system_owner'::public.app_role)
    OR public._has_permission_core(auth.uid(), 'settings.edit')
  );
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  SELECT public._authz_probe_allowed(_user_id)
     AND public._has_role_core(_user_id, _role);
$$;

create or replace function public.has_permission(_user_id uuid, _permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  SELECT public._authz_probe_allowed(_user_id)
     AND public._has_permission_core(_user_id, _permission_key);
$$;

revoke execute on function public._has_role_core(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public._has_permission_core(uuid, text) from public, anon, authenticated;
revoke execute on function public._authz_probe_allowed(uuid) from public, anon, authenticated;
