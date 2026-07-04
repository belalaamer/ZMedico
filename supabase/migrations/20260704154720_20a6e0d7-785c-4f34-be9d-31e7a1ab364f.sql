CREATE OR REPLACE FUNCTION public.tg_branches_cleanup_orphans()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Drop pending reminders for the deleted branch so they don't fire or appear in lists
  DELETE FROM public.reminders WHERE branch_id = OLD.id AND status = 'pending';
  -- Mark open queue alerts resolved (queue_alerts uses `state`, not `status`)
  UPDATE public.queue_alerts
     SET state = 'resolved', resolved_at = now(), updated_at = now()
   WHERE branch_id = OLD.id AND state IN ('active','snoozed');
  RETURN OLD;
END $function$;