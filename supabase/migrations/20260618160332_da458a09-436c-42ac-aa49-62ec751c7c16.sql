
-- Restrict Realtime channel subscriptions for branch-scoped topics.
-- Topics used by the app:
--   queue_alerts:<branch_id>
--   queue_alerts_queue:<branch_id>
--   audit_probe:<branch_id>:<ts>
-- Any other topic is allowed for authenticated users (no branch data).

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.realtime_topic_branch_allowed(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  prefix text;
  maybe_branch text;
  branch uuid;
BEGIN
  IF _topic IS NULL OR length(_topic) = 0 THEN
    RETURN true;
  END IF;

  parts := string_to_array(_topic, ':');
  prefix := parts[1];

  IF prefix NOT IN ('queue_alerts', 'queue_alerts_queue', 'audit_probe') THEN
    RETURN true;
  END IF;

  maybe_branch := parts[2];
  IF maybe_branch IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    branch := maybe_branch::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN public.user_has_branch_access(branch);
END;
$$;

GRANT EXECUTE ON FUNCTION public.realtime_topic_branch_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read branch-scoped realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can read branch-scoped realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.realtime_topic_branch_allowed((realtime.topic())::text));

DROP POLICY IF EXISTS "Authenticated can write branch-scoped realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can write branch-scoped realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.realtime_topic_branch_allowed((realtime.topic())::text));
