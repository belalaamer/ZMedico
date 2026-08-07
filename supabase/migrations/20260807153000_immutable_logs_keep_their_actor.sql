-- Deleting a user failed for everyone who had ever DONE anything.
--
-- Two safeguards were cancelling each other out. Both are correct on their own:
--
--   1. audit_logs, client_errors and treasury_transactions are guarded
--      append-only. A trigger rejects UPDATE with "append-only (op=UPDATE)".
--   2. Their actor columns carried ON DELETE SET NULL.
--
-- ON DELETE SET NULL is not a delete -- it is an UPDATE on the child row. So
-- deleting a profile asked Postgres to blank the actor on that person's audit
-- history, the append-only guard refused, and the whole delete was rolled back.
-- That is why exactly the accounts with a history refused to go, while the empty
-- orphans deleted cleanly. Six and six.
--
-- The guard is not what is wrong here. Blanking the actor on an audit record is
-- the wrong outcome regardless of whether it succeeds: an audit trail that forgets
-- who acted is not an audit trail. ISO/IEC 27001:2022 A.8.15 requires logs be
-- protected against modification, and HIPAA 164.312(b) requires records of
-- activity to identify the actor. A financial ledger is the same case -- a cash
-- movement with no author cannot be reconciled or challenged.
--
-- So the SET NULL is the defect. These columns are dropped as enforced foreign
-- keys and kept as plain uuid values: a historical reference to who acted, which
-- stays readable after the person leaves. The rows are never touched by anyone
-- else's deletion again, which is what an immutable log is supposed to mean.
--
-- Nothing is deleted and no stored value changes. Only the enforcement is removed.
--
-- client_errors.branch_id is included for the same reason and fixes a second
-- problem nobody had hit yet: a branch could never be deleted either, once any
-- browser error had been reported from it.

ALTER TABLE public.audit_logs            DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.client_errors         DROP CONSTRAINT IF EXISTS client_errors_user_id_fkey;
ALTER TABLE public.client_errors         DROP CONSTRAINT IF EXISTS client_errors_branch_id_fkey;
ALTER TABLE public.treasury_transactions DROP CONSTRAINT IF EXISTS treasury_transactions_created_by_fkey;

COMMENT ON COLUMN public.audit_logs.user_id IS
  'Who performed the action. Historical reference, intentionally not a foreign key: '
  'the audit trail must keep naming the actor after the account is removed, and this '
  'table is append-only so a cascade could never rewrite it anyway.';

COMMENT ON COLUMN public.treasury_transactions.created_by IS
  'Who recorded the cash movement. Historical reference, intentionally not a foreign '
  'key: financial attribution has to survive the employee leaving.';

COMMENT ON COLUMN public.client_errors.user_id IS
  'Who hit the error, when known. Historical reference, intentionally not a foreign key.';

COMMENT ON COLUMN public.client_errors.branch_id IS
  'Where the error was reported from. Historical reference, intentionally not a foreign '
  'key: this table is append-only, so a SET NULL cascade made branches undeletable.';
