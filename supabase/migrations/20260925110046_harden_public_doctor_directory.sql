-- Restrict the public doctor directory to actually bookable context.
--
-- list_doctors_for_service is intentionally callable by anon for the public
-- booking page, but it must not expose doctors from branches that are not
-- online-bookable or accept a service id from another tenant.
--
-- doctor_service_assignment_allowed is an internal helper used only by
-- SECURITY DEFINER database functions/triggers. Remove direct Data API access.

CREATE OR REPLACE FUNCTION public.list_doctors_for_service(
  p_branch_id uuid,
  p_service_id uuid,
  p_service_kind text DEFAULT 'service'::text
)
RETURNS TABLE(id uuid, full_name text, full_name_en text, full_name_ar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.full_name_en, p.full_name_ar
  FROM public.profiles p
  JOIN public.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'doctor'::public.app_role
  JOIN public.staff_branches sb
    ON sb.user_id = p.id
   AND sb.branch_id = p_branch_id
  WHERE COALESCE(p_service_kind, 'service') = 'service'
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      LEFT JOIN public.appointment_settings aps
        ON aps.branch_id = b.id
      JOIN public.services s
        ON s.id = p_service_id
       AND s.tenant_id = b.tenant_id
       AND s.is_active = true
       AND s.deleted_at IS NULL
       AND s.available_online = true
      WHERE b.id = p_branch_id
        AND b.is_active = true
        AND COALESCE(aps.allow_online_booking, true) = true
        AND public.tenant_has_active_subscription(b.tenant_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE (sp.id = p.id OR sp.linked_user_id = p.id)
        AND sp.status = 'active'::public.staff_status
    )
    AND public.doctor_service_assignment_allowed(
      p.id,
      p_branch_id,
      p_service_id,
      'service'
    )
  ORDER BY COALESCE(p.full_name_en, p.full_name_ar, p.full_name) NULLS LAST, p.id;
$function$;

-- Keep the existing public booking contract explicit.
REVOKE ALL ON FUNCTION public.list_doctors_for_service(uuid, uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_doctors_for_service(uuid, uuid, text)
  TO anon, authenticated, service_role;

-- Tighten the unfiltered doctors array returned with initial booking options.
-- It remains for API compatibility but now only contains active doctors that
-- belong to at least one active branch where public online booking is enabled.
CREATE OR REPLACE FUNCTION public.public_booking_options_for_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', COALESCE(t.name_en, t.name_ar, t.name),
    'tenant_name_en', t.name_en,
    'tenant_name_ar', t.name_ar,
    'tenant_slug', t.slug,
    'branches', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'name_en', b.name_en,
          'name_ar', b.name_ar,
          'address', b.address,
          'phone', b.phone,
          'city', b.city,
          'working_hours_start', b.working_hours_start,
          'working_hours_end', b.working_hours_end,
          'working_days', b.working_days,
          'max_future_booking_days', COALESCE(s.max_future_booking_days, 30),
          'min_advance_booking_hours', COALESCE(s.min_advance_booking_hours, 1),
          'slot_duration_minutes', COALESCE(s.slot_duration_minutes, 30),
          'require_confirmation', COALESCE(s.require_confirmation, false)
        )
        ORDER BY b.name_en
      )
      FROM public.branches b
      LEFT JOIN public.appointment_settings s ON s.branch_id = b.id
      WHERE b.tenant_id = t.id
        AND b.is_active = true
        AND COALESCE(s.allow_online_booking, true) = true
    ), '[]'::jsonb),
    'services', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name_en', s.name_en,
          'name_ar', s.name_ar,
          'duration_minutes', s.default_duration_minutes,
          'price', s.default_price,
          'description_en', s.description_en,
          'description_ar', s.description_ar,
          'source', 'service'
        )
        ORDER BY COALESCE(s.display_order, 0), s.name_en
      )
      FROM public.services s
      WHERE s.tenant_id = t.id
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.available_online = true
    ), '[]'::jsonb),
    'procedures', '[]'::jsonb,
    'doctors', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'full_name', pr.full_name,
          'full_name_en', pr.full_name_en,
          'full_name_ar', pr.full_name_ar
        )
        ORDER BY COALESCE(pr.full_name_en, pr.full_name_ar, pr.full_name)
      )
      FROM public.profiles pr
      WHERE EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.staff_branches sb ON sb.user_id = ur.user_id
        JOIN public.branches b ON b.id = sb.branch_id
        LEFT JOIN public.appointment_settings aps ON aps.branch_id = b.id
        WHERE ur.user_id = pr.id
          AND ur.role = 'doctor'::public.app_role
          AND b.tenant_id = t.id
          AND b.is_active = true
          AND COALESCE(aps.allow_online_booking, true) = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.staff_profiles sp
        WHERE (sp.id = pr.id OR sp.linked_user_id = pr.id)
          AND sp.status = 'active'::public.staff_status
      )
    ), '[]'::jsonb)
  )
  FROM public.tenants t
  WHERE t.id = p_tenant_id
    AND public.tenant_has_active_subscription(t.id);
$function$;

REVOKE ALL ON FUNCTION public.public_booking_options_for_tenant(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_options_for_tenant(uuid)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.doctor_service_assignment_allowed(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_service_assignment_allowed(uuid, uuid, uuid, text)
  TO service_role;
