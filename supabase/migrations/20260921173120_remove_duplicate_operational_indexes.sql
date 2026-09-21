-- Remove redundant non-constraint indexes reported by Supabase Performance Advisor.
-- Canonical indexes kept:
--   audit_logs_created_idx       ON audit_logs(created_at DESC)
--   idx_audit_entity             ON audit_logs(entity_type, entity_id)
--   notifications_user_idx       ON notifications(user_id, created_at DESC)
DROP INDEX IF EXISTS public.idx_audit_created;
DROP INDEX IF EXISTS public.idx_audit_logs_created;
DROP INDEX IF EXISTS public.idx_audit_logs_entity;
DROP INDEX IF EXISTS public.idx_notifications_user_created;
