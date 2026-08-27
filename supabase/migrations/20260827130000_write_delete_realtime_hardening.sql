-- Write/delete and Realtime hardening for ZMedico.
-- This migration does not mutate existing business rows. It adds:
--   1) a database-side guard against cross-tenant branch reassignment;
--   2) a topic authorization helper for private Realtime channels;
--   3) private-channel RLS policies on realtime.messages.
-- System Owner remains trusted at the row-policy layer, but direct branch
-- reassignment across tenants is blocked for every caller. A future, audited
-- platform migration operation must be explicit if re-homing is ever required.

CREATE OR REPLACE FUNCTION public.prevent_cross_tenant_branch_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  old_tenant uuid;
  new_tenant uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    IF OLD.branch_id IS NULL OR NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'branch_id cannot be cleared or assigned from NULL on an existing row'
        USING ERRCODE = '23514';
    END IF;

    SELECT tenant_id INTO old_tenant
      FROM public.branches
     WHERE id = OLD.branch_id;
    SELECT tenant_id INTO new_tenant
      FROM public.branches
     WHERE id = NEW.branch_id;

    IF old_tenant IS NULL OR new_tenant IS NULL OR old_tenant IS DISTINCT FROM new_tenant THEN
      RAISE EXCEPTION 'cross-tenant branch reassignment is not allowed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_cross_tenant_branch_reassignment() FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments','patients','invoices','payments','expenses',
    'treasury','treasury_daily_closes','medical_records','physio_cases',
    'treatment_plans','patient_wallet_transactions','doctor_commissions',
    'inventory','inventory_transactions','stock_alerts','queue_alerts',
    'reminders','attendance','payroll','work_schedules','staff_targets',
    'staff_profiles','staff_branches'
  ] LOOP
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = t
         AND column_name = 'branch_id'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_cross_tenant_branch_reassignment ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_prevent_cross_tenant_branch_reassignment BEFORE UPDATE OF branch_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_cross_tenant_branch_reassignment()',
        t
      );
    END IF;
  END LOOP;
END
$do$;

-- Realtime authorization is based on the authenticated user's JWT and the
-- exact topic shape emitted by the client. No patient or message payload is
-- stored or returned by this helper.
CREATE OR REPLACE FUNCTION public.can_access_realtime_topic(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id text;
  v_uuid uuid;
BEGIN
  IF auth.uid() IS NULL OR _topic IS NULL OR length(_topic) > 256 THEN
    RETURN false;
  END IF;

  IF _topic ~ '^(notif|topbar-notifications):[0-9a-fA-F-]{36}(-|:|$)' THEN
    v_id := substring(_topic from '^[^:]+:([0-9a-fA-F-]{36})');
    RETURN v_id = auth.uid()::text;
  END IF;

  IF _topic ~ '^(queue_alerts_queue|queue-appts|queue_alerts|inv-alerts|stock-overview-sync|audit_probe):[0-9a-fA-F-]{36}(-|:|$)' THEN
    v_id := substring(_topic from '^[^:]+:([0-9a-fA-F-]{36})');
    v_uuid := v_id::uuid;
    RETURN public.user_has_branch_access(v_uuid);
  END IF;

  IF _topic ~ '^(physio_sessions|physio_reassessments):[0-9a-fA-F-]{36}(-|:|$)' THEN
    v_id := substring(_topic from '^[^:]+:([0-9a-fA-F-]{36})');
    v_uuid := v_id::uuid;
    RETURN public.user_has_branch_access_via_physio_case(v_uuid);
  END IF;

  RETURN false;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.can_access_realtime_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_realtime_topic(text) TO authenticated;

-- Realtime authorization is authenticated-only. The Realtime service uses the
-- authenticated role and the policies below; anonymous direct table access and
-- unused UPDATE/DELETE privileges are not part of the client contract.
REVOKE ALL ON TABLE realtime.messages FROM anon;
REVOKE UPDATE, DELETE ON TABLE realtime.messages FROM authenticated;
GRANT SELECT, INSERT ON TABLE realtime.messages TO authenticated;

DROP POLICY IF EXISTS zmedico_private_topic_read ON realtime.messages;
CREATE POLICY zmedico_private_topic_read
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (public.can_access_realtime_topic(realtime.topic()));

DROP POLICY IF EXISTS zmedico_private_topic_send ON realtime.messages;
CREATE POLICY zmedico_private_topic_send
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_realtime_topic(realtime.topic()));

COMMENT ON FUNCTION public.prevent_cross_tenant_branch_reassignment() IS
  'Blocks direct UPDATE reassignment of branch_id across tenants or to/from NULL.';
COMMENT ON FUNCTION public.can_access_realtime_topic(text) IS
  'Allows only authenticated users with branch/case/user scope to join ZMedico private topics.';
