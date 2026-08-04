-- Harden client_errors against edits, explicitly.
--
-- Found by testing: an admin's UPDATE silently affected 0 rows instead of being
-- refused. Two reasons:
--   1. The baseline grants migration (20260803085927) set ALTER DEFAULT
--      PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
--      authenticated, so this brand-new table inherited UPDATE and DELETE.
--   2. With no UPDATE policy, RLS simply matched no rows -- safe in effect, but
--      silent, and the append-only trigger never fired.
--
-- Relying on the ABSENCE of a policy is fragile: the day someone adds an UPDATE
-- policy for an unrelated reason, the audit trail becomes editable. Make the
-- prohibition explicit at both layers so it fails loudly and on purpose.
--
-- Verified after applying, impersonating real users:
--   staff can report: OK | forgery blocked: OK | staff reads 0: OK
--   admin reads 1: OK | update refused: OK | delete refused: OK

REVOKE UPDATE, DELETE, TRUNCATE ON public.client_errors FROM authenticated;

DROP POLICY IF EXISTS client_errors_no_update ON public.client_errors;
CREATE POLICY client_errors_no_update
  ON public.client_errors
  AS RESTRICTIVE
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS client_errors_no_delete_policy ON public.client_errors;
CREATE POLICY client_errors_no_delete_policy
  ON public.client_errors
  AS RESTRICTIVE
  FOR DELETE
  USING (false);
