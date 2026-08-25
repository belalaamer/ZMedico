-- Keep the booking-facing service separate from the clinical procedure snapshot.
-- Existing appointments remain valid because the relationship is nullable.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_service_id_idx
  ON public.appointments(service_id)
  WHERE service_id IS NOT NULL;

-- Public booking historically stores the selected service name in appointments.procedure.
-- Link those future inserts to the tenant-scoped service when the snapshot matches exactly,
-- while preserving procedure as a display/history snapshot for backward compatibility.
CREATE OR REPLACE FUNCTION public.link_appointment_service_from_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_id IS NULL
     AND NEW.branch_id IS NOT NULL
     AND NULLIF(trim(NEW.procedure), '') IS NOT NULL THEN
    SELECT s.id
      INTO NEW.service_id
    FROM public.services s
    JOIN public.branches b ON b.tenant_id = s.tenant_id
    WHERE b.id = NEW.branch_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (s.name_en = NEW.procedure OR s.name_ar = NEW.procedure)
    ORDER BY s.display_order, s.name_en
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_appointment_service ON public.appointments;
CREATE TRIGGER trg_link_appointment_service
  BEFORE INSERT OR UPDATE OF branch_id, procedure, service_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.link_appointment_service_from_snapshot();

REVOKE ALL ON FUNCTION public.link_appointment_service_from_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_appointment_service_from_snapshot() TO authenticated;
