CREATE OR REPLACE FUNCTION public.get_lead_analytics(
  p_branch_id uuid DEFAULT NULL,
  p_start_at timestamptz DEFAULT (now() - interval '30 days'),
  p_end_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Lead analytics permission required' USING ERRCODE = '42501';
  END IF;

  IF p_end_at <= p_start_at OR p_end_at - p_start_at > interval '366 days' THEN
    RAISE EXCEPTION 'Analytics period must be between one hour and 366 days';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'Branch access denied' USING ERRCODE = '42501';
  END IF;

  WITH scoped AS (
    SELECT
      l.id,
      l.branch_id,
      l.source,
      l.campaign_name,
      l.assigned_to,
      l.created_at,
      l.next_followup_at,
      l.appointment_id,
      l.lost_reason_id,
      ps.slug AS stage_slug
    FROM public.leads l
    LEFT JOIN public.lead_pipeline_stages ps ON ps.id = l.stage_id
    WHERE l.deleted_at IS NULL
      AND l.created_at >= p_start_at
      AND l.created_at < p_end_at
      AND (p_branch_id IS NULL OR l.branch_id = p_branch_id)
  ),
  classified AS (
    SELECT
      s.*,
      (
        s.appointment_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.lead_activities a
          WHERE a.lead_id = s.id AND a.activity_type = 'appointment_booked'
        )
      ) AS is_booked,
      (s.stage_slug = 'started-treatment') AS is_started,
      (s.lost_reason_id IS NOT NULL OR s.stage_slug = 'lost-lead') AS is_lost,
      EXISTS (
        SELECT 1 FROM public.lead_activities a
        WHERE a.lead_id = s.id
          AND a.activity_type IN ('call','contacted','whatsapp_sent','appointment_booked')
      ) AS is_contacted
    FROM scoped s
  ),
  counts AS (
    SELECT
      count(*)::integer AS leads,
      count(*) FILTER (WHERE is_booked)::integer AS booked,
      count(*) FILTER (WHERE is_started)::integer AS started,
      count(*) FILTER (WHERE is_lost)::integer AS lost,
      count(*) FILTER (WHERE is_contacted)::integer AS contacted,
      count(*) FILTER (WHERE assigned_to IS NULL)::integer AS unassigned,
      count(*) FILTER (WHERE next_followup_at IS NOT NULL AND next_followup_at <= now())::integer AS followups_due,
      count(*) FILTER (WHERE next_followup_at IS NOT NULL AND next_followup_at < now())::integer AS followups_overdue
    FROM classified
  ),
  first_contact AS (
    SELECT
      s.id,
      GREATEST(0, EXTRACT(EPOCH FROM (MIN(a.occurred_at) - s.created_at)) / 60.0) AS response_minutes
    FROM scoped s
    JOIN public.lead_activities a ON a.lead_id = s.id
    WHERE a.activity_type IN ('call','contacted','whatsapp_sent','appointment_booked')
    GROUP BY s.id, s.created_at
  ),
  source_rows AS (
    SELECT
      COALESCE(NULLIF(c.source, ''), 'not_set') AS source,
      count(*)::integer AS leads,
      count(*) FILTER (WHERE c.is_contacted)::integer AS contacted,
      count(*) FILTER (WHERE c.is_booked)::integer AS booked,
      count(*) FILTER (WHERE c.is_started)::integer AS started,
      count(*) FILTER (WHERE c.is_lost)::integer AS lost
    FROM classified c
    GROUP BY COALESCE(NULLIF(c.source, ''), 'not_set')
    ORDER BY count(*) DESC, source
  ),
  campaign_rows AS (
    SELECT
      COALESCE(NULLIF(c.campaign_name, ''), 'not_set') AS campaign,
      COALESCE(NULLIF(c.source, ''), 'not_set') AS source,
      count(*)::integer AS leads,
      count(*) FILTER (WHERE c.is_booked)::integer AS booked,
      count(*) FILTER (WHERE c.is_started)::integer AS started,
      count(*) FILTER (WHERE c.is_lost)::integer AS lost
    FROM classified c
    GROUP BY COALESCE(NULLIF(c.campaign_name, ''), 'not_set'), COALESCE(NULLIF(c.source, ''), 'not_set')
    ORDER BY count(*) DESC, campaign
  ),
  trend_rows AS (
    SELECT
      (c.created_at AT TIME ZONE 'UTC')::date::text AS day,
      count(*)::integer AS leads,
      count(*) FILTER (WHERE c.is_booked)::integer AS booked,
      count(*) FILTER (WHERE c.is_started)::integer AS started,
      count(*) FILTER (WHERE c.is_lost)::integer AS lost
    FROM classified c
    GROUP BY (c.created_at AT TIME ZONE 'UTC')::date
    ORDER BY day
  ),
  assignee_rows AS (
    SELECT
      c.assigned_to AS assignee_id,
      count(*)::integer AS assigned_leads,
      count(*) FILTER (WHERE c.is_contacted)::integer AS contacted,
      count(*) FILTER (WHERE c.is_booked)::integer AS booked,
      count(*) FILTER (WHERE c.is_started)::integer AS started,
      count(*) FILTER (WHERE c.is_lost)::integer AS lost,
      round(avg(fc.response_minutes)::numeric, 1) AS avg_response_minutes
    FROM classified c
    LEFT JOIN first_contact fc ON fc.id = c.id
    WHERE c.assigned_to IS NOT NULL
    GROUP BY c.assigned_to
    ORDER BY count(*) DESC
  ),
  count_row AS (
    SELECT * FROM counts LIMIT 1
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start_at', p_start_at, 'end_at', p_end_at, 'branch_id', p_branch_id),
    'summary', jsonb_build_object(
      'leads', cr.leads,
      'contacted', cr.contacted,
      'booked', cr.booked,
      'started', cr.started,
      'lost', cr.lost,
      'unassigned', cr.unassigned,
      'followups_due', cr.followups_due,
      'followups_overdue', cr.followups_overdue,
      'booking_conversion_rate', round((cr.booked::numeric / NULLIF(cr.leads, 0)) * 100, 1),
      'treatment_conversion_rate', round((cr.started::numeric / NULLIF(cr.leads, 0)) * 100, 1),
      'lost_rate', round((cr.lost::numeric / NULLIF(cr.leads, 0)) * 100, 1),
      'first_contact_rate', round((cr.contacted::numeric / NULLIF(cr.leads, 0)) * 100, 1),
      'avg_response_minutes', round((SELECT avg(response_minutes) FROM first_contact)::numeric, 1)
    ),
    'sources', COALESCE((SELECT jsonb_agg(to_jsonb(source_rows)) FROM source_rows), '[]'::jsonb),
    'campaigns', COALESCE((SELECT jsonb_agg(to_jsonb(campaign_rows)) FROM campaign_rows), '[]'::jsonb),
    'trend', COALESCE((SELECT jsonb_agg(to_jsonb(trend_rows)) FROM trend_rows), '[]'::jsonb),
    'assignees', COALESCE((SELECT jsonb_agg(to_jsonb(assignee_rows)) FROM assignee_rows), '[]'::jsonb)
  ) INTO v_result
  FROM count_row cr;

  RETURN COALESCE(v_result, jsonb_build_object('summary', jsonb_build_object('leads', 0), 'sources', '[]'::jsonb, 'campaigns', '[]'::jsonb, 'trend', '[]'::jsonb, 'assignees', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_lead_analytics(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_analytics(uuid, timestamptz, timestamptz) TO authenticated, service_role;
