
-- ===== BRANCHES additions =====
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS is_main_branch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manager_id uuid,
  ADD COLUMN IF NOT EXISTS working_hours_start time,
  ADD COLUMN IF NOT EXISTS working_hours_end time,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS branches_code_key ON public.branches(code) WHERE code IS NOT NULL;

-- Auto-generate branch code if missing
CREATE OR REPLACE FUNCTION public.tg_branch_before_insert_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF new.code IS NULL OR new.code = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\D', '', 'g'), '')::int), 0) + 1 INTO n FROM public.branches;
    new.code := 'BR' || lpad(n::text, 3, '0');
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS branches_before_insert_code ON public.branches;
CREATE TRIGGER branches_before_insert_code BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.tg_branch_before_insert_code();

DROP TRIGGER IF EXISTS branches_set_updated_at ON public.branches;
CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ===== NOTIFICATIONS =====
DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('appointment','payment','follow_up','system','alert');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title_ar text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  message_ar text NOT NULL DEFAULT '',
  message_en text NOT NULL DEFAULT '',
  type public.notification_type NOT NULL DEFAULT 'system',
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications(user_id) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_select_own ON public.notifications;
CREATE POLICY notif_select_own ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
CREATE POLICY notif_insert_any ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS notif_update_own ON public.notifications;
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS notif_delete_own ON public.notifications;
CREATE POLICY notif_delete_own ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ===== REMINDERS =====
DO $$ BEGIN
  CREATE TYPE public.reminder_channel AS ENUM ('sms','email','whatsapp','push');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE public.reminder_status AS ENUM ('pending','sent','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid,
  patient_id uuid,
  branch_id uuid,
  reminder_type public.reminder_channel NOT NULL DEFAULT 'sms',
  scheduled_time timestamptz NOT NULL,
  message_ar text NOT NULL DEFAULT '',
  message_en text NOT NULL DEFAULT '',
  status public.reminder_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reminders_sched_idx ON public.reminders(scheduled_time);
CREATE INDEX IF NOT EXISTS reminders_status_idx ON public.reminders(status);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rem_select ON public.reminders;
CREATE POLICY rem_select ON public.reminders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS rem_insert ON public.reminders;
CREATE POLICY rem_insert ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS rem_update ON public.reminders;
CREATE POLICY rem_update ON public.reminders FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS rem_delete ON public.reminders;
CREATE POLICY rem_delete ON public.reminders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
