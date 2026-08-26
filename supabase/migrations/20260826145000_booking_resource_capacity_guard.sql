-- Enforce configured resource capacity for all appointment writes that
-- select a booking resource. Legacy rows with only room text are matched
-- by room name for counting, without backfilling or mutating historical data.

CREATE OR REPLACE FUNCTION public.enforce_booking_resource_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_resource public.booking_resources%ROWTYPE;
  v_count integer;
BEGIN
  IF NEW.status::text IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;

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

  IF NEW.resource_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.* INTO v_resource
  FROM public.booking_resources r
  WHERE r.id = NEW.resource_id AND r.branch_id = NEW.branch_id AND r.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource_unavailable';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_resource.id::text, 0));

  SELECT count(*)::integer INTO v_count
  FROM public.appointments a
  WHERE a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND a.branch_id = NEW.branch_id
    AND a.deleted_at IS NULL
    AND a.status::text NOT IN ('cancelled','no_show')
    AND a.scheduled_at < NEW.scheduled_at + make_interval(mins => COALESCE(NEW.duration_minutes, 30))
    AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > NEW.scheduled_at
    AND (
      a.resource_id = NEW.resource_id
      OR (a.resource_id IS NULL AND lower(trim(COALESCE(a.room, ''))) IN (lower(v_resource.name_en), lower(v_resource.name_ar)))
    );

  IF v_count >= v_resource.capacity THEN
    RAISE EXCEPTION 'resource_capacity_exceeded';
  END IF;

  IF NULLIF(trim(NEW.room), '') IS NULL THEN
    NEW.room := v_resource.name_en;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_resource_capacity ON public.appointments;
CREATE TRIGGER trg_enforce_booking_resource_capacity
BEFORE INSERT OR UPDATE OF resource_id, room, scheduled_at, duration_minutes, status
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_resource_capacity();

REVOKE ALL ON FUNCTION public.enforce_booking_resource_capacity() FROM PUBLIC, anon, authenticated;
