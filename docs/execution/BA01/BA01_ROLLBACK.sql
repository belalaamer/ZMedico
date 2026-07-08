-- BA-01 Rollback. Fully removes the Authorization Version Registry.
-- Safe: no other object depends on these.
BEGIN;
DROP TRIGGER IF EXISTS authz_versions_no_delete    ON public.authz_versions;
DROP TRIGGER IF EXISTS authz_versions_immutability ON public.authz_versions;
DROP FUNCTION IF EXISTS public.authz_versions_block_delete();
DROP FUNCTION IF EXISTS public.authz_versions_enforce_immutability();
DROP FUNCTION IF EXISTS public.authz_current_version(text);
DROP FUNCTION IF EXISTS public.authz_current_versions();
DROP TABLE    IF EXISTS public.authz_versions;
COMMIT;
