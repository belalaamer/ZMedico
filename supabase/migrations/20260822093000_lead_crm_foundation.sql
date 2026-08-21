-- Lead CRM foundation for Blitz Physio.
-- A lead is separate from a patient until conversion, but can reference the
-- existing patient and appointment rows without duplicating their data.

CREATE TABLE IF NOT EXISTS public.lead_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#2563eb',
  is_closed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, slug)
);

CREATE TABLE IF NOT EXISTS public.lead_lost_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, slug)
);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  alternative_phone text,
  gender text,
  age integer CHECK (age IS NULL OR age BETWEEN 0 AND 120),
  governorate text,
  area text,
  address text,
  distance_km numeric(8,2),
  occupation text,
  complaint text,
  pain_area text,
  previous_surgery boolean,
  medical_notes text,
  source text NOT NULL DEFAULT 'manual',
  platform text,
  campaign_name text,
  campaign_id text,
  ad_set text,
  ad_name text,
  utm_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage_id uuid REFERENCES public.lead_pipeline_stages(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  lead_score integer NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  last_activity_at timestamptz,
  next_followup_at timestamptz,
  number_of_calls integer NOT NULL DEFAULT 0 CHECK (number_of_calls >= 0),
  number_of_whatsapp_messages integer NOT NULL DEFAULT 0 CHECK (number_of_whatsapp_messages >= 0),
  last_contact_method text,
  last_contact_at timestamptz,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  lost_reason_id uuid REFERENCES public.lead_lost_reasons(id) ON DELETE SET NULL,
  lost_notes text,
  converted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  channel text,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz NOT NULL,
  channel text NOT NULL DEFAULT 'call',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped','cancelled')),
  source_rule text,
  notes text,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  reason text
);

CREATE INDEX IF NOT EXISTS leads_branch_stage_idx ON public.leads(branch_id, stage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_phone_normalized_idx ON public.leads(phone_normalized);
CREATE INDEX IF NOT EXISTS leads_followup_idx ON public.leads(branch_id, next_followup_at);
CREATE INDEX IF NOT EXISTS lead_activities_timeline_idx ON public.lead_activities(lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lead_followups_due_idx ON public.lead_followups(branch_id, status, due_at);

CREATE OR REPLACE FUNCTION public.lead_staff_access(_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR public.has_role(auth.uid(), 'doctor'::public.app_role)
      OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
$$;

ALTER TABLE public.lead_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lost_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_stages_staff_select ON public.lead_pipeline_stages;
CREATE POLICY lead_stages_staff_select ON public.lead_pipeline_stages
  FOR SELECT TO authenticated USING (branch_id IS NULL OR public.user_has_branch_access(branch_id));
DROP POLICY IF EXISTS lead_stages_admin_write ON public.lead_pipeline_stages;
CREATE POLICY lead_stages_admin_write ON public.lead_pipeline_stages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS lead_reasons_staff_select ON public.lead_lost_reasons;
CREATE POLICY lead_reasons_staff_select ON public.lead_lost_reasons
  FOR SELECT TO authenticated USING (branch_id IS NULL OR public.user_has_branch_access(branch_id));
DROP POLICY IF EXISTS lead_reasons_admin_write ON public.lead_lost_reasons;
CREATE POLICY lead_reasons_admin_write ON public.lead_lost_reasons
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS leads_staff_select ON public.leads;
CREATE POLICY leads_staff_select ON public.leads
  FOR SELECT TO authenticated USING (
    public.user_has_branch_access(branch_id)
    AND public.lead_staff_access(branch_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.doctor_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS leads_staff_insert ON public.leads;
CREATE POLICY leads_staff_insert ON public.leads
  FOR INSERT TO authenticated WITH CHECK (
    public.user_has_branch_access(branch_id)
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role))
  );
DROP POLICY IF EXISTS leads_staff_update ON public.leads;
CREATE POLICY leads_staff_update ON public.leads
  FOR UPDATE TO authenticated USING (
    public.user_has_branch_access(branch_id)
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR assigned_to = auth.uid())
  ) WITH CHECK (
    public.user_has_branch_access(branch_id)
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR assigned_to = auth.uid())
  );
DROP POLICY IF EXISTS leads_admin_delete ON public.leads;
CREATE POLICY leads_admin_delete ON public.leads
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS lead_activities_staff_select ON public.lead_activities;
CREATE POLICY lead_activities_staff_select ON public.lead_activities
  FOR SELECT TO authenticated USING (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id));
DROP POLICY IF EXISTS lead_activities_staff_insert ON public.lead_activities;
CREATE POLICY lead_activities_staff_insert ON public.lead_activities
  FOR INSERT TO authenticated WITH CHECK (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id));

DROP POLICY IF EXISTS lead_followups_staff_select ON public.lead_followups;
CREATE POLICY lead_followups_staff_select ON public.lead_followups
  FOR SELECT TO authenticated USING (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id));
DROP POLICY IF EXISTS lead_followups_staff_insert ON public.lead_followups;
CREATE POLICY lead_followups_staff_insert ON public.lead_followups
  FOR INSERT TO authenticated WITH CHECK (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id));
DROP POLICY IF EXISTS lead_followups_staff_update ON public.lead_followups;
CREATE POLICY lead_followups_staff_update ON public.lead_followups
  FOR UPDATE TO authenticated USING (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id))
  WITH CHECK (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id));

DROP POLICY IF EXISTS lead_assignments_staff_select ON public.lead_assignments;
CREATE POLICY lead_assignments_staff_select ON public.lead_assignments
  FOR SELECT TO authenticated USING (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id));
DROP POLICY IF EXISTS lead_assignments_staff_insert ON public.lead_assignments;
CREATE POLICY lead_assignments_staff_insert ON public.lead_assignments
  FOR INSERT TO authenticated WITH CHECK (public.user_has_branch_access(branch_id) AND public.lead_staff_access(branch_id));

CREATE OR REPLACE FUNCTION public.tg_lead_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_leads_updated ON public.leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_updated_at();
DROP TRIGGER IF EXISTS trg_lead_followups_updated ON public.lead_followups;
CREATE TRIGGER trg_lead_followups_updated BEFORE UPDATE ON public.lead_followups FOR EACH ROW EXECUTE FUNCTION public.tg_lead_updated_at();
DROP TRIGGER IF EXISTS trg_lead_stages_updated ON public.lead_pipeline_stages;
CREATE TRIGGER trg_lead_stages_updated BEFORE UPDATE ON public.lead_pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.tg_lead_updated_at();

INSERT INTO public.lead_pipeline_stages (branch_id, slug, name_en, name_ar, position, color, is_closed)
VALUES
  (NULL, 'new-lead', 'New Lead', 'عميل محتمل جديد', 10, '#2563eb', false),
  (NULL, 'assigned', 'Assigned', 'تم الإسناد', 20, '#7c3aed', false),
  (NULL, 'first-contact', 'First Contact', 'أول تواصل', 30, '#0891b2', false),
  (NULL, 'follow-up', 'Follow-up Scheduled', 'متابعة مجدولة', 40, '#d97706', false),
  (NULL, 'appointment-booked', 'Appointment Booked', 'تم حجز موعد', 50, '#16a34a', false),
  (NULL, 'visited-clinic', 'Visited Clinic', 'زار العيادة', 60, '#15803d', false),
  (NULL, 'started-treatment', 'Started Treatment', 'بدأ العلاج', 70, '#166534', true),
  (NULL, 'lost-lead', 'Lost Lead', 'عميل محتمل خاسر', 80, '#dc2626', true)
ON CONFLICT (branch_id, slug) DO NOTHING;

INSERT INTO public.lead_lost_reasons (branch_id, slug, name_en, name_ar, position)
VALUES
  (NULL, 'too-expensive', 'Too expensive', 'السعر مرتفع', 10),
  (NULL, 'too-far', 'Too far', 'المكان بعيد', 20),
  (NULL, 'no-answer', 'No answer', 'لا يرد', 30),
  (NULL, 'another-clinic', 'Went to another clinic', 'ذهب لعيادة أخرى', 40),
  (NULL, 'not-interested', 'Not interested', 'غير مهتم', 50),
  (NULL, 'busy', 'Busy', 'مشغول', 60),
  (NULL, 'wrong-number', 'Wrong number', 'رقم خاطئ', 70),
  (NULL, 'other', 'Other', 'سبب آخر', 80)
ON CONFLICT (branch_id, slug) DO NOTHING;

-- Record public bookings as Leads without duplicating patient data.
CREATE OR REPLACE FUNCTION public.tg_public_booking_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage uuid;
  v_name text;
  v_phone text;
  v_lead uuid;
BEGIN
  IF NEW.booking_source IS NULL OR NEW.booking_source <> 'public_booking' THEN RETURN NEW; END IF;

  SELECT id INTO v_stage
  FROM public.lead_pipeline_stages
  WHERE slug = 'appointment-booked' AND (branch_id = NEW.branch_id OR branch_id IS NULL)
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  SELECT COALESCE(NEW.public_booking_metadata->>'public_name', p.first_name_en)
    INTO v_name FROM public.patients p WHERE p.id = NEW.patient_id;
  SELECT COALESCE(NEW.public_booking_metadata->>'phone_digits', p.phone)
    INTO v_phone FROM public.patients p WHERE p.id = NEW.patient_id;

  INSERT INTO public.leads (
    branch_id, full_name, phone, phone_normalized, source, platform, stage_id,
    complaint, patient_id, appointment_id, lead_score, last_activity_at, created_by
  ) VALUES (
    NEW.branch_id, COALESCE(v_name, 'Public booking'), COALESCE(v_phone, 'unknown'),
    regexp_replace(COALESCE(v_phone, 'unknown'), '[^0-9]', '', 'g'), 'public_booking', 'Website',
    v_stage, NEW.notes, NEW.patient_id, NEW.id, 80, now(), NULL
  ) RETURNING id INTO v_lead;

  INSERT INTO public.lead_activities (lead_id, branch_id, activity_type, channel, body, metadata, created_by)
  VALUES (v_lead, NEW.branch_id, 'appointment_booked', 'website', 'Appointment booked through public booking page',
    jsonb_build_object('appointment_id', NEW.id, 'booking_reference', NEW.public_booking_reference), NULL);

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_public_booking_to_lead ON public.appointments;
CREATE TRIGGER trg_public_booking_to_lead
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_public_booking_to_lead();

-- Legacy role-permission compatibility rows.
INSERT INTO public.role_permissions (role, module, actions)
VALUES
  ('admin', 'leads', ARRAY['view','create','edit','export','delete']),
  ('manager', 'leads', ARRAY['view','create','edit','export']),
  ('receptionist', 'leads', ARRAY['view','create','edit']),
  ('doctor', 'leads', ARRAY['view'])
ON CONFLICT (role, module) DO UPDATE SET actions = EXCLUDED.actions, updated_at = now();

-- Canonical permission rows and bundle grants.
INSERT INTO public.authz_permissions (key, group_key, display_name, description, risk_level, default_scope, metadata, deprecated, introduced_in)
VALUES
  ('leads.view', 'leads', 'View leads', 'View leads and their timeline within authorized branches', 'low', 'branch', '{}'::jsonb, false, 'CRM-1'),
  ('leads.create', 'leads', 'Create leads', 'Create a new lead within an authorized branch', 'medium', 'branch', '{}'::jsonb, false, 'CRM-1'),
  ('leads.edit', 'leads', 'Edit leads', 'Update lead details, stages, follow-ups, and assignments', 'medium', 'branch', '{}'::jsonb, false, 'CRM-1'),
  ('leads.export', 'leads', 'Export lead analytics', 'Export lead and campaign performance data', 'medium', 'branch', '{}'::jsonb, false, 'CRM-1'),
  ('leads.delete', 'leads', 'Delete leads', 'Delete a lead; prefer marking it lost instead', 'high', 'branch', '{}'::jsonb, false, 'CRM-1')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT v.bundle_key, v.permission_key
FROM (VALUES
  ('bundle.role.admin', 'leads.view'), ('bundle.role.admin', 'leads.create'), ('bundle.role.admin', 'leads.edit'), ('bundle.role.admin', 'leads.export'), ('bundle.role.admin', 'leads.delete'),
  ('bundle.role.manager', 'leads.view'), ('bundle.role.manager', 'leads.create'), ('bundle.role.manager', 'leads.edit'), ('bundle.role.manager', 'leads.export'),
  ('bundle.role.receptionist', 'leads.view'), ('bundle.role.receptionist', 'leads.create'), ('bundle.role.receptionist', 'leads.edit'),
  ('bundle.role.doctor', 'leads.view')
) AS v(bundle_key, permission_key)
WHERE EXISTS (SELECT 1 FROM public.authz_bundles b WHERE b.key = v.bundle_key)
  AND EXISTS (SELECT 1 FROM public.authz_permissions p WHERE p.key = v.permission_key)
ON CONFLICT DO NOTHING;
