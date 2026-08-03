-- Pre-launch QA remediation: ledger immutability + notification scoping.
-- Applied live 2026-08-03 as migration 20260803104634.

-- =====================================================================
-- 1. HIGH: treasury_transactions append-only enforcement had a bypass.
-- _tg_treasury_tx_append_only() allowed UPDATE and DELETE whenever the session
-- setting app.allow_treasury_tx_mutation = 'on'. Any SECURITY DEFINER function,
-- migration, or service-role script could set it and silently erase financial
-- history.
--
-- Verified before removal: a scan of every function in pg_proc found the ONLY
-- reference to app.allow_treasury_tx_mutation is the trigger itself, so nothing
-- legitimate depends on the bypass.
--
-- Reversal entries are INSERTs, so append-only enforcement does not interfere
-- with refunds (re-verified live after this change).
-- =====================================================================
CREATE OR REPLACE FUNCTION public._tg_treasury_tx_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'treasury_transactions is append-only (op=%). Post a reversing entry instead of editing history.', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

-- Defence in depth: even if the trigger were dropped, RLS denies the delete.
DROP POLICY IF EXISTS treasury_tx_no_delete ON public.treasury_transactions;
CREATE POLICY treasury_tx_no_delete
  ON public.treasury_transactions
  AS RESTRICTIVE
  FOR DELETE
  USING (false);

-- =====================================================================
-- 2. HIGH (multi-branch blocker): tg_appointment_create_notifications()
-- notified EVERY admin / manager / receptionist in the whole tenant with no
-- branch filter. With one branch this is merely noisy; the moment a second
-- clinic exists, staff at branch B get a notification for every appointment
-- booked at branch A.
--
-- Now scoped via staff_branches -- the same relationship the RLS layer uses.
-- If branch_id is NULL the previous tenant-wide behaviour is preserved.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_appointment_create_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname_en text;
  pname_ar text;
  appt_local text;
BEGIN
  SELECT
    COALESCE(NULLIF(trim(concat_ws(' ', first_name_en, last_name_en)), ''), 'patient'),
    COALESCE(NULLIF(trim(concat_ws(' ', first_name_ar, last_name_ar)), ''), 'مريض')
  INTO pname_en, pname_ar
  FROM public.patients WHERE id = NEW.patient_id;

  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');

  INSERT INTO public.notifications(
    user_id, title_ar, title_en, message_ar, message_en, type,
    related_entity_type, related_entity_id
  )
  SELECT DISTINCT
    ur.user_id,
    'موعد جديد',
    'New appointment',
    'تم حجز موعد جديد للمريض ' || pname_ar || ' في ' || appt_local,
    'New appointment booked for ' || pname_en || ' on ' || appt_local,
    'appointment'::public.notification_type,
    'appointment',
    NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role)
    AND (
      NEW.branch_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.staff_branches sb
        WHERE sb.user_id = ur.user_id AND sb.branch_id = NEW.branch_id
      )
    );

  RETURN NEW;
END;
$$;
