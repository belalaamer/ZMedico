-- Doctor/service eligibility for branch-aware scheduling.
-- Empty assignment rows for a service preserve the legacy behavior: all active
-- doctors in the branch remain eligible until the clinic starts configuring it.

CREATE TABLE IF NOT EXISTS public.doctor_service_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id uuid NOT NULL,
  service_kind text NOT NULL DEFAULT 'service' CHECK (service_kind IN ('service','procedure')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, doctor_id, service_id, service_kind)
);

CREATE INDEX IF NOT EXISTS doctor_service_assignments_lookup_idx
  ON public.doctor_service_assignments (branch_id, service_id, service_kind, doctor_id);

CREATE OR REPLACE FUNCTION public.set_doctor_service_assignment_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT b.tenant_id INTO v_tenant_id FROM public.branches b WHERE b.id = NEW.branch_id LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'branch_unavailable'; END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_service_assignment_tenant ON public.doctor_service_assignments;
CREATE TRIGGER trg_doctor_service_assignment_tenant
BEFORE INSERT OR UPDATE OF branch_id ON public.doctor_service_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_doctor_service_assignment_tenant();

ALTER TABLE public.doctor_service_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_service_assignment_select ON public.doctor_service_assignments;
CREATE POLICY doctor_service_assignment_select
ON public.doctor_service_assignments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR public.user_has_branch_access(branch_id)
);

DROP POLICY IF EXISTS doctor_service_assignment_manage ON public.doctor_service_assignments;
CREATE POLICY doctor_service_assignment_manage
ON public.doctor_service_assignments FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
    AND public.user_has_branch_access(branch_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
    AND public.user_has_branch_access(branch_id)
  )
);

CREATE OR REPLACE FUNCTION public.doctor_service_assignment_allowed(
  p_doctor_id uuid, p_branch_id uuid, p_service_id uuid, p_service_kind text DEFAULT 'service'
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_doctor_id IS NULL
    OR (
      EXISTS (
        SELECT 1 FROM public.staff_branches sb
        JOIN public.user_roles ur ON ur.user_id = sb.user_id
        WHERE sb.user_id = p_doctor_id
          AND sb.branch_id = p_branch_id
          AND ur.role = 'doctor'::public.app_role
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.doctor_service_assignments dsa
          WHERE dsa.branch_id = p_branch_id
            AND dsa.service_id = p_service_id
            AND dsa.service_kind = COALESCE(p_service_kind, 'service')
        )
        OR EXISTS (
          SELECT 1 FROM public.doctor_service_assignments dsa
          WHERE dsa.branch_id = p_branch_id
            AND dsa.service_id = p_service_id
            AND dsa.service_kind = COALESCE(p_service_kind, 'service')
            AND dsa.doctor_id = p_doctor_id
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.list_doctors_for_service(
  p_branch_id uuid, p_service_id uuid, p_service_kind text DEFAULT 'service'
)
RETURNS TABLE(id uuid, full_name text, full_name_en text, full_name_ar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.full_name_en, p.full_name_ar
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'doctor'::public.app_role
  JOIN public.staff_branches sb ON sb.user_id = p.id AND sb.branch_id = p_branch_id
  WHERE (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.user_has_branch_access(p_branch_id)
  )
  AND public.doctor_service_assignment_allowed(p.id, p_branch_id, p_service_id, p_service_kind)
  ORDER BY COALESCE(p.full_name_en, p.full_name_ar, p.full_name) NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.set_doctor_service_assignments(
  p_doctor_id uuid, p_branch_id uuid, p_service_ids uuid[], p_service_kind text DEFAULT 'service'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id uuid;
  v_service_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
      AND public.user_has_branch_access(p_branch_id)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT b.tenant_id INTO v_tenant_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active = true LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'branch_unavailable'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_branches sb
    JOIN public.user_roles ur ON ur.user_id = sb.user_id
    WHERE sb.user_id = p_doctor_id AND sb.branch_id = p_branch_id AND ur.role = 'doctor'::public.app_role
  ) THEN RAISE EXCEPTION 'doctor_unavailable'; END IF;

  DELETE FROM public.doctor_service_assignments
  WHERE doctor_id = p_doctor_id AND branch_id = p_branch_id AND service_kind = COALESCE(p_service_kind, 'service');

  FOREACH v_service_id IN ARRAY COALESCE(p_service_ids, ARRAY[]::uuid[]) LOOP
    IF COALESCE(p_service_kind, 'service') = 'service' THEN
      IF NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = v_service_id AND s.tenant_id = v_tenant_id AND s.is_active = true AND s.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'service_unavailable';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.procedures pr WHERE pr.id = v_service_id AND pr.is_active = true AND pr.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'procedure_unavailable';
    END IF;

    INSERT INTO public.doctor_service_assignments (tenant_id, branch_id, doctor_id, service_id, service_kind)
    VALUES (v_tenant_id, p_branch_id, p_doctor_id, v_service_id, COALESCE(p_service_kind, 'service'))
    ON CONFLICT (branch_id, doctor_id, service_id, service_kind) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_service_assignment_allowed(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_service_assignment_allowed(uuid, uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_doctors_for_service(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_doctors_for_service(uuid, uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_doctor_service_assignments(uuid, uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_doctor_service_assignments(uuid, uuid, uuid[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_doctor_service_eligibility()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text := 'service';
BEGIN
  IF NEW.doctor_id IS NULL OR NEW.service_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = NEW.service_id AND s.tenant_id = (SELECT b.tenant_id FROM public.branches b WHERE b.id = NEW.branch_id) AND s.is_active = true AND s.deleted_at IS NULL) THEN
    v_kind := 'procedure';
  END IF;
  IF NOT public.doctor_service_assignment_allowed(NEW.doctor_id, NEW.branch_id, NEW.service_id, v_kind) THEN
    RAISE EXCEPTION 'doctor_not_available_for_service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_doctor_service_eligibility ON public.appointments;
CREATE TRIGGER trg_appointment_doctor_service_eligibility
BEFORE INSERT OR UPDATE OF doctor_id, service_id, branch_id ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_doctor_service_eligibility();

-- Integrate the public slot RPC with the selected doctor/service mapping.
CREATE OR REPLACE FUNCTION public.public_booking_slots_for_tenant(
  p_tenant_id uuid, p_branch_id uuid, p_service_id uuid, p_date date, p_doctor_id uuid DEFAULT NULL
)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz, available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.appointment_settings%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_duration integer;
  v_service_name text;
  v_service_kind text := 'service';
  v_start timestamp;
  v_end timestamp;
  v_slot timestamp;
  v_slot_end timestamptz;
  v_count integer;
  v_resource_count integer;
  v_resource public.booking_resources%ROWTYPE;
BEGIN
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND OR NOT public.tenant_has_active_subscription(p_tenant_id) THEN RETURN; END IF;
  IF p_doctor_id IS NOT NULL AND NOT public.doctor_service_assignment_allowed(p_doctor_id, p_branch_id, p_service_id, 'service') THEN
    IF NOT public.doctor_service_assignment_allowed(p_doctor_id, p_branch_id, p_service_id, 'procedure') THEN RETURN; END IF;
    v_service_kind := 'procedure';
  END IF;
  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = p_branch_id LIMIT 1;
  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RETURN; END IF;
  IF p_date < CURRENT_DATE OR p_date > CURRENT_DATE + COALESCE(v_settings.max_future_booking_days, 30) THEN RETURN; END IF;
  IF NOT (EXTRACT(DOW FROM p_date)::integer = ANY(COALESCE(v_branch.working_days, ARRAY[0,1,2,3,4,5,6]))) THEN RETURN; END IF;
  v_duration := COALESCE(v_settings.slot_duration_minutes, 30);
  SELECT s.default_duration_minutes, s.name_en INTO v_duration, v_service_name FROM public.services s WHERE s.id = p_service_id AND s.tenant_id = p_tenant_id AND s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true LIMIT 1;
  IF v_service_name IS NULL THEN
    v_service_kind := 'procedure';
    SELECT COALESCE(p.default_duration, v_duration), p.name_en INTO v_duration, v_service_name FROM public.procedures p WHERE p.id = p_service_id AND p.is_active = true AND p.deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_service_name IS NULL THEN RETURN; END IF;
  SELECT count(*)::integer INTO v_resource_count FROM public.booking_resources r WHERE r.branch_id = p_branch_id AND r.is_active = true;
  v_start := p_date + COALESCE(v_branch.working_hours_start, '09:00'::time);
  v_end := p_date + COALESCE(v_branch.working_hours_end, '21:00'::time);
  FOR v_slot IN SELECT gs FROM generate_series(v_start, v_end - make_interval(mins => v_duration), make_interval(mins => v_duration + COALESCE(v_settings.buffer_minutes, 0))) gs LOOP
    slot_start := v_slot AT TIME ZONE 'Africa/Cairo';
    v_slot_end := slot_start + make_interval(mins => v_duration);
    slot_end := v_slot_end;
    available := false;
    IF p_doctor_id IS NOT NULL THEN
      SELECT count(*)::integer INTO v_count FROM public.appointments a WHERE a.branch_id = p_branch_id AND a.doctor_id = p_doctor_id AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show') AND a.scheduled_at < v_slot_end AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
      IF v_count > 0 THEN RETURN NEXT; CONTINUE; END IF;
    END IF;
    IF v_resource_count > 0 THEN
      FOR v_resource IN SELECT r.* FROM public.booking_resources r WHERE r.branch_id = p_branch_id AND r.is_active = true AND public.booking_resource_is_eligible(r.id, p_service_id, v_service_kind) ORDER BY r.display_order, r.name_en LOOP
        SELECT count(*)::integer INTO v_count FROM public.appointments a WHERE a.branch_id = p_branch_id AND (a.resource_id = v_resource.id OR (a.resource_id IS NULL AND lower(trim(COALESCE(a.room, ''))) IN (lower(v_resource.name_en), lower(v_resource.name_ar)))) AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show') AND a.scheduled_at < v_slot_end AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
        IF v_count < v_resource.capacity THEN available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1)); EXIT; END IF;
      END LOOP;
    ELSE
      SELECT count(*)::integer INTO v_count FROM public.appointments a WHERE a.branch_id = p_branch_id AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show') AND a.scheduled_at < v_slot_end AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id);
      available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1)) AND v_count < COALESCE(v_settings.max_appointments_per_slot, 1);
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;
