-- Self-hosted client error logging.
--
-- CONTEXT: the app has src/lib/observability/sentry.ts, but it short-circuits
-- unless VITE_SENTRY_DSN is set, and it is not. Production therefore had NO
-- error reporting at all: a crash was invisible until a user phoned in.
--
-- The owner does not want a third-party Sentry account. This provides the same
-- core benefit using infrastructure that already exists: browser errors are
-- written to a table in this database, readable by admins.
--
-- Design notes:
--   * Append-only. No UPDATE or DELETE policy, matching audit_logs.
--   * INSERT is allowed for any authenticated user, because the whole point is
--     to capture crashes from ordinary staff. A user may only attribute a row
--     to themselves (WITH CHECK on user_id), so one user cannot forge another
--     user's error history.
--   * Reading is restricted to the same permission that gates audit_logs
--     (settings.export), so error text -- which can incidentally contain
--     patient names from a failed screen -- is not readable by all staff.
--   * Fields are deliberately bounded (see the CHECK constraints) so a runaway
--     error loop cannot bloat the table with megabyte stack traces.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id     uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  kind          text NOT NULL DEFAULT 'error',
  message       text NOT NULL,
  stack         text,
  url           text,
  component     text,
  user_agent    text,
  app_version   text,
  correlation_id text,
  CONSTRAINT client_errors_message_len CHECK (char_length(message) <= 2000),
  CONSTRAINT client_errors_stack_len   CHECK (stack IS NULL OR char_length(stack) <= 8000),
  CONSTRAINT client_errors_kind_valid  CHECK (kind IN ('error','unhandledrejection','boundary'))
);

CREATE INDEX IF NOT EXISTS client_errors_occurred_at_idx ON public.client_errors (occurred_at DESC);
CREATE INDEX IF NOT EXISTS client_errors_user_idx        ON public.client_errors (user_id);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may report a crash, but only as themselves.
DROP POLICY IF EXISTS client_errors_insert_self ON public.client_errors;
CREATE POLICY client_errors_insert_self
  ON public.client_errors
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Only users who can already export the audit log may read error text.
DROP POLICY IF EXISTS client_errors_select_admin ON public.client_errors;
CREATE POLICY client_errors_select_admin
  ON public.client_errors
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'settings.export'));

-- Append-only: block edits and deletions outright, the same way audit_logs is
-- protected, so an error trail cannot be quietly cleaned up.
CREATE OR REPLACE FUNCTION public._tg_client_errors_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RAISE EXCEPTION 'client_errors is append-only (op=%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

DROP TRIGGER IF EXISTS client_errors_no_update ON public.client_errors;
CREATE TRIGGER client_errors_no_update
  BEFORE UPDATE ON public.client_errors
  FOR EACH ROW EXECUTE FUNCTION public._tg_client_errors_append_only();

DROP TRIGGER IF EXISTS client_errors_no_delete ON public.client_errors;
CREATE TRIGGER client_errors_no_delete
  BEFORE DELETE ON public.client_errors
  FOR EACH ROW EXECUTE FUNCTION public._tg_client_errors_append_only();

GRANT SELECT, INSERT ON public.client_errors TO authenticated;
GRANT ALL ON public.client_errors TO service_role;

-- Retention helper. Errors are for debugging, not permanent records, so old
-- rows can be trimmed. Restricted to service_role / cron; it bypasses the
-- append-only trigger deliberately and is the ONLY sanctioned way to prune.
CREATE OR REPLACE FUNCTION public.prune_client_errors(_keep_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  n int;
BEGIN
  ALTER TABLE public.client_errors DISABLE TRIGGER client_errors_no_delete;
  DELETE FROM public.client_errors WHERE occurred_at < now() - make_interval(days => _keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  ALTER TABLE public.client_errors ENABLE TRIGGER client_errors_no_delete;
  RETURN n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.prune_client_errors(int) FROM PUBLIC, anon, authenticated;
