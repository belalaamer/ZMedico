-- Branch deletion was failing because audit_logs.branch_id had ON DELETE SET NULL,
-- which fires an UPDATE on audit_logs and is blocked by the append-only trigger.
-- Drop the FK; keep the column as a historical uuid reference so the audit trail stays intact.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_branch_id_fkey;