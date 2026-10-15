-- Populated clinical branches must be archived, not physically erased. The
-- legacy RPC had an incomplete hard-coded table list and could delete audit,
-- clinical, and financial history before failing on a newer foreign key.
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.admin_force_delete_branch(uuid)'::regprocedure))
       <> 'c6ba4c9892cbc89753653401c4141534' THEN
    RAISE EXCEPTION 'Unexpected admin_force_delete_branch definition; review drift before applying';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_force_delete_branch(_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only system owners may manage branch deletion';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _branch_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Branch not found';
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'Permanent deletion of a populated branch is disabled; archive the branch instead';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_delete_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_delete_branch(uuid) TO authenticated;

-- The ordinary empty-branch delete path still exists, but it must never remove
-- the final branch belonging to a tenant. A database trigger enforces this for
-- every client, not only the current UI.
CREATE OR REPLACE FUNCTION public.tg_guard_last_tenant_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_surviving_branch uuid;
  v_reference record;
  v_has_references boolean;
BEGIN
  -- A Repeatable Read snapshot can hide children committed after it began.
  -- Only permit physical deletion with fresh statement snapshots; archival
  -- remains available at stronger isolation levels.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Physical branch deletion requires a fresh Read Committed transaction or archival';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('zmedico.remaining-branch:' || OLD.tenant_id::text, 0)
  );
  SELECT id INTO v_surviving_branch
    FROM public.branches
   WHERE tenant_id = OLD.tenant_id AND id <> OLD.id
   ORDER BY id
   LIMIT 1
   FOR UPDATE NOWAIT;
  IF v_surviving_branch IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Cannot delete the last remaining branch for a tenant';
  END IF;

  -- Do not rely on FK rejection: CASCADE silently erases financial records
  -- and SET NULL silently loses clinical branch attribution. Discover every
  -- FK to branches.id, including future tables, and fail closed before either.
  FOR v_reference IN
    SELECT n.nspname, c.relname, a.attname
      FROM pg_catalog.pg_constraint fk
      JOIN pg_catalog.pg_class c ON c.oid = fk.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL unnest(fk.conkey, fk.confkey) AS keys(local_att, foreign_att)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = keys.local_att
      JOIN pg_catalog.pg_attribute target ON target.attrelid = fk.confrelid AND target.attnum = keys.foreign_att
     WHERE fk.contype = 'f' AND fk.confrelid = 'public.branches'::regclass
       AND target.attname = 'id'
     ORDER BY n.nspname, c.relname, a.attname
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
      v_reference.nspname, v_reference.relname, v_reference.attname)
      INTO v_has_references USING OLD.id;
    IF v_has_references THEN
      RAISE EXCEPTION USING ERRCODE = '23503',
        MESSAGE = 'Branch has linked records; archive it instead';
    END IF;
  END LOOP;

  -- Audit branch attribution intentionally has no FK and is append-only.
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE branch_id = OLD.id
             OR (entity_type = 'branch' AND entity_id = OLD.id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = 'Branch has linked records; archive it instead';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_guard_last_tenant_branch() FROM PUBLIC;

DROP TRIGGER IF EXISTS branches_guard_last_tenant_branch ON public.branches;
CREATE TRIGGER branches_guard_last_tenant_branch
BEFORE DELETE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_last_tenant_branch();
