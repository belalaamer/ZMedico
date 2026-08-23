-- Compatibility bridge for the currently deployed frontend.
-- It keeps /book working for the existing default clinic while the new
-- tenant-aware frontend is being deployed. It never returns cross-tenant data.
CREATE OR REPLACE FUNCTION public.public_booking_options()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'default' AND is_active = true LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_context_required'; END IF;
  RETURN public.public_booking_options_for_tenant(v_tenant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.public_booking_slots(
  p_branch_id uuid, p_service_id uuid, p_date date, p_doctor_id uuid DEFAULT NULL
)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz, available boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'default' AND is_active = true LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_context_required'; END IF;
  RETURN QUERY SELECT * FROM public.public_booking_slots_for_tenant(v_tenant_id, p_branch_id, p_service_id, p_date, p_doctor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.public_create_booking(
  p_branch_id uuid, p_service_id uuid, p_slot_start timestamptz, p_full_name text, p_phone text,
  p_doctor_id uuid DEFAULT NULL, p_email text DEFAULT NULL, p_complaint text DEFAULT NULL,
  p_source text DEFAULT 'public_booking', p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'default' AND is_active = true LIMIT 1;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_context_required'; END IF;
  RETURN public.public_create_booking_for_tenant(v_tenant_id, p_branch_id, p_service_id, p_slot_start, p_full_name, p_phone, p_doctor_id, p_email, p_complaint, p_source, p_metadata);
END;
$$;
