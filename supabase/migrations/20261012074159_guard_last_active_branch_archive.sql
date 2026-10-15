DO $$
BEGIN
  IF md5(pg_get_functiondef('public.admin_archive_branch(uuid)'::regprocedure))
       <> 'de26927e0ea28d4dcf2edde6f66f3d4a' THEN
    RAISE EXCEPTION 'Unexpected admin_archive_branch definition; review drift before applying';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.tg_guard_last_active_tenant_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_active integer;
  v_surviving_branch uuid;
  v_removing_active boolean := (TG_OP = 'DELETE');
  v_tenant_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_removing_active := NOT NEW.is_active;
  END IF;

  IF OLD.is_active AND v_removing_active THEN
    -- Serialize active-branch state changes per tenant without locking unrelated
    -- tenants. This prevents two concurrent archives from both seeing a peer.
    PERFORM pg_advisory_xact_lock(
      hashtextextended('zmedico.active-branch:' || OLD.tenant_id::text, 0)
    );

    SELECT is_active
      INTO v_tenant_active
      FROM public.tenants
     WHERE id = OLD.tenant_id;

    -- Cancelled/expired tenants are intentionally allowed to archive every
    -- branch. The availability invariant applies only to an active tenant.
    IF NOT COALESCE(v_tenant_active, false) THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;

    -- An advisory lock alone does not refresh a Repeatable Read snapshot.
    -- Lock a surviving peer so stale snapshots fail with a retryable conflict
    -- instead of permitting both archives. NOWAIT avoids a row/advisory cycle
    -- with direct updates that already hold their target row before triggering.
    SELECT id
      INTO v_surviving_branch
      FROM public.branches
     WHERE tenant_id = OLD.tenant_id
       AND id <> OLD.id
       AND is_active
     ORDER BY id
     LIMIT 1
     FOR UPDATE NOWAIT;

    v_other_active := CASE WHEN v_surviving_branch IS NULL THEN 0 ELSE 1 END;

    IF v_other_active = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Cannot archive or delete the last active branch for a tenant';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_guard_last_active_tenant_branch() FROM PUBLIC;

DROP TRIGGER IF EXISTS branches_guard_last_active_tenant_branch ON public.branches;
CREATE TRIGGER branches_guard_last_active_tenant_branch
BEFORE UPDATE OF is_active OR DELETE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_last_active_tenant_branch();

CREATE OR REPLACE FUNCTION public.admin_archive_branch(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch public.branches%ROWTYPE;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND public.user_has_branch_access(_branch_id)
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Not authorized to archive this branch';
  END IF;

  SELECT * INTO v_branch
    FROM public.branches
   WHERE id = _branch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Branch not found';
  END IF;

  IF NOT v_branch.is_active THEN
    RETURN jsonb_build_object('success', true, 'branch_id', _branch_id, 'already_archived', true);
  END IF;

  UPDATE public.branches
     SET is_active = false,
         is_main_branch = false,
         updated_at = now()
   WHERE id = _branch_id;

  INSERT INTO public.audit_logs(
    user_id, branch_id, action, entity_type, entity_id, old_values, new_values
  ) VALUES (
    auth.uid(), _branch_id, 'branch.archive', 'branch', _branch_id,
    jsonb_build_object('is_active', v_branch.is_active, 'is_main_branch', v_branch.is_main_branch),
    jsonb_build_object('is_active', false, 'is_main_branch', false)
  );

  RETURN jsonb_build_object('success', true, 'branch_id', _branch_id, 'already_archived', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_archive_branch(uuid) TO authenticated;
