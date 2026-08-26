-- Keep portal account access aligned with the branch-level portal switch.
-- The snapshot RPC already checks patient_portal_accounts.portal_enabled, so
-- disabling a branch immediately disables its existing patient accounts without
-- deleting users or patient records.
CREATE OR REPLACE FUNCTION public.sync_patient_portal_branch_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.patient_portal_accounts
     SET portal_enabled = NEW.portal_enabled,
         updated_at = now()
   WHERE branch_id = NEW.branch_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_patient_portal_branch_enabled ON public.patient_portal_settings;
CREATE TRIGGER trg_sync_patient_portal_branch_enabled
AFTER INSERT OR UPDATE OF portal_enabled ON public.patient_portal_settings
FOR EACH ROW EXECUTE FUNCTION public.sync_patient_portal_branch_enabled();
