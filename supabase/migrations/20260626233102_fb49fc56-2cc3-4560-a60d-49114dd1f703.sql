CREATE OR REPLACE FUNCTION public.tg_branches_cleanup_orphans()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Drop pending reminders for the deleted branch so they don't fire or appear in lists
  DELETE FROM public.reminders WHERE branch_id = OLD.id AND status = 'pending';
  -- Mark queue alerts resolved
  UPDATE public.queue_alerts SET status = 'resolved', resolved_at = now()
    WHERE branch_id = OLD.id AND status IN ('active','snoozed');
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS tg_branches_cleanup_orphans ON public.branches;
CREATE TRIGGER tg_branches_cleanup_orphans
BEFORE DELETE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.tg_branches_cleanup_orphans();