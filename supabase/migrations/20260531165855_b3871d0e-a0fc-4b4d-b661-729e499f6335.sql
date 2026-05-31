
-- ==========================================================
-- Phase 2-4: Insurance, Audit, Notifications, Backups
-- ==========================================================

-- 1) Insurance companies
CREATE TABLE IF NOT EXISTS public.insurance_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text,
  contact_phone text,
  contact_email text,
  address text,
  default_coverage_ratio numeric(5,2) NOT NULL DEFAULT 80.00,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_companies TO authenticated;
GRANT ALL ON public.insurance_companies TO service_role;
ALTER TABLE public.insurance_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ic_read" ON public.insurance_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "ic_write_admin" ON public.insurance_companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER ic_updated_at BEFORE UPDATE ON public.insurance_companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Patient insurance fields
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS insurance_company_id uuid REFERENCES public.insurance_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insurance_policy_number text,
  ADD COLUMN IF NOT EXISTS insurance_coverage_ratio numeric(5,2),
  ADD COLUMN IF NOT EXISTS insurance_policy_expiry date;

-- 3) Invoice claim fields
DO $$ BEGIN
  CREATE TYPE public.claim_status AS ENUM ('none','pending','submitted','approved','rejected','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS insurance_company_id uuid REFERENCES public.insurance_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_status public.claim_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS claim_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_number text,
  ADD COLUMN IF NOT EXISTS claim_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_resolved_at timestamptz;

-- 4) Generic audit trigger
CREATE OR REPLACE FUNCTION public.tg_audit_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
  v_branch uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW); v_old := NULL; v_id := (NEW).id;
    BEGIN v_branch := (NEW).branch_id; EXCEPTION WHEN others THEN v_branch := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_new := to_jsonb(NEW); v_old := to_jsonb(OLD); v_id := (NEW).id;
    BEGIN v_branch := (NEW).branch_id; EXCEPTION WHEN others THEN v_branch := NULL; END;
  ELSE
    v_new := NULL; v_old := to_jsonb(OLD); v_id := (OLD).id;
    BEGIN v_branch := (OLD).branch_id; EXCEPTION WHEN others THEN v_branch := NULL; END;
  END IF;

  INSERT INTO public.audit_logs(user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), v_branch, lower(TG_OP), TG_TABLE_NAME, v_id, v_old, v_new);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Attach to key tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','invoices','payments','prescriptions','medical_records','products','staff_profiles','user_roles','insurance_companies']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_audit_changes()', t, t);
  END LOOP;
END $$;

-- 5) Low stock -> notification trigger
CREATE OR REPLACE FUNCTION public.tg_stock_alert_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prod record;
  title_en text; title_ar text; msg_en text; msg_ar text;
BEGIN
  SELECT name_en, name_ar INTO prod FROM public.products WHERE id = NEW.product_id;
  IF NEW.alert_type = 'out_of_stock' THEN
    title_en := 'Out of stock'; title_ar := 'نفد المخزون';
  ELSIF NEW.alert_type = 'low_stock' THEN
    title_en := 'Low stock'; title_ar := 'مخزون منخفض';
  ELSIF NEW.alert_type = 'expired' THEN
    title_en := 'Expired item'; title_ar := 'صنف منتهي';
  ELSE
    title_en := 'Expiring soon'; title_ar := 'يقترب انتهاؤه';
  END IF;
  msg_en := coalesce(prod.name_en,'product') || ' — qty: ' || NEW.quantity;
  msg_ar := coalesce(prod.name_ar, prod.name_en, 'منتج') || ' — الكمية: ' || NEW.quantity;

  INSERT INTO public.notifications(user_id, title_ar, title_en, message_ar, message_en, type, related_entity_type, related_entity_id)
  SELECT ur.user_id, title_ar, title_en, msg_ar, msg_en, 'system'::public.notification_type, 'stock_alert', NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::app_role,'manager'::app_role);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stock_alert_notify ON public.stock_alerts;
CREATE TRIGGER stock_alert_notify AFTER INSERT ON public.stock_alerts
FOR EACH ROW WHEN (NEW.is_resolved = false)
EXECUTE FUNCTION public.tg_stock_alert_notify();

-- 6) System backups tracking
CREATE TABLE IF NOT EXISTS public.system_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'completed',
  size_bytes bigint,
  tables_count int,
  rows_count int,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.system_backups TO authenticated;
GRANT ALL ON public.system_backups TO service_role;
ALTER TABLE public.system_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sb_read_admin" ON public.system_backups FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "sb_insert_admin" ON public.system_backups FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
