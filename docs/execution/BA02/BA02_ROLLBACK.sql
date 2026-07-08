-- BA-02 Rollback. Removes the Authorization State Model.
-- Safe: read-only surface; no dependents.
BEGIN;
DROP VIEW     IF EXISTS public.v_authz_state;
DROP FUNCTION IF EXISTS public.authz_current_state();
COMMIT;
