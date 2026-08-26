-- Assign an available configured resource to internal appointment inserts
-- when staff did not choose a room. This closes the bypass through walk-ins
-- and treatment-plan scheduling while preserving historical rows.

CREATE OR REPLACE FUNCTION public.enforce_booking_resource_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_resource public.booking_resources%ROWTYPE;
  v_count integer;
  v_resource_count integer;
  v_service_kind text := 'service';
  v_should_allocate boolean := false;
BEGIN
  IF NEW.status::text IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_allocate := true;
  ELSIF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
     OR NEW.room IS DISTINCT FROM OLD.room
     OR NEW.resource_id IS DISTINCT FROM OLD.resource_id THEN
    v_should_allocate := true;
  END IF;

  IF NOT v_should_allocate THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer INTO v_resource_count
  FROM public.booking_resources r
  WHERE r.branch_id = NEW.branch_id AND r.is_active = true;
  IF v_resource_count = 0 THEN
    RETURN NEW;
  END IF;

  -- Serialize allocation for a branch/time before looking for the last
  -- remaining room capacity.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.branch_id::text || ':' || NEW.scheduled_at::text, 0));

  IF NEW.resource_id IS NULL AND NULLIF(trim(NEW.room), '') IS NOT NULL THEN
    SELECT r.* INTO v_resource
    FROM public.booking_resources r
    WHERE r.branch_id = NEW.branch_id
      AND r.is_active = true
      AND (lower(r.name_en) = lower(trim(NEW.room)) OR lower(r.name_ar) = lower(trim(NEW.room)))
    ORDER BY r.display_order, r.name_en
    LIMIT 1;
    IF FOUND THEN NEW.resource_id := v_resource.id; END IF;
  END IF;

  IF NEW.resource_id IS NOT NULL THEN
    SELECT r.* INTO v_resource
    FROM public.booking_resources r
    WHERE r.id = NEW.resource_id AND r.branch_id = NEW.branch_id AND r.is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'resource_unavailable'; END IF;
    IF NOT public.booking_resource_is_eligible(v_resource.id, NEW.service_id, v_service_kind) THEN
      RAISE EXCEPTION 'resource_not_available_for_service';
    END IF;
  ELSE
    IF NEW.service_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = NEW.service_id) THEN
      v_service_kind := 'procedure';
    END IF;
    FOR v_resource IN
      SELECT r.* FROM public.booking_resources r
      WHERE r.branch_id = NEW.branch_id AND r.is_active = true
        AND public.booking_resource_is_eligible(r.id, NEW.service_id, v_service_kind)
      ORDER BY r.display_order, r.name_en
    LOOP
      SELECT count(*)::integer INTO v_count
      FROM public.appointments a
      WHERE a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND a.branch_id = NEW.branch_id AND a.resource_id = v_resource.id
        AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
        AND a.scheduled_at < NEW.scheduled_at + make_interval(mins => COALESCE(NEW.duration_minutes, 30))
        AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > NEW.scheduled_at;
      IF v_count < v_resource.capacity THEN
        NEW.resource_id := v_resource.id;
        NEW.room := COALESCE(NULLIF(trim(NEW.room), ''), v_resource.name_en);
        EXIT;
      END IF;
    END LOOP;
    IF NEW.resource_id IS NULL THEN RAISE EXCEPTION 'resource_capacity_exceeded'; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_resource.id::text, 0));
  SELECT count(*)::integer INTO v_count
  FROM public.appointments a
  WHERE a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND a.branch_id = NEW.branch_id AND a.deleted_at IS NULL
    AND a.status::text NOT IN ('cancelled','no_show')
    AND a.scheduled_at < NEW.scheduled_at + make_interval(mins => COALESCE(NEW.duration_minutes, 30))
    AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > NEW.scheduled_at
    AND (a.resource_id = v_resource.id OR (a.resource_id IS NULL AND lower(trim(COALESCE(a.room, ''))) IN (lower(v_resource.name_en), lower(v_resource.name_ar))));
  IF v_count >= v_resource.capacity THEN RAISE EXCEPTION 'resource_capacity_exceeded'; END IF;
  IF NULLIF(trim(NEW.room), '') IS NULL THEN NEW.room := v_resource.name_en; END IF;
  RETURN NEW;
END;
$$;
