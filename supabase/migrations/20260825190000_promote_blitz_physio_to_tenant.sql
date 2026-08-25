-- Blitz Physio is the only branch and the only tenant-scoped dataset in the
-- former default tenant. Promote the existing tenant in place instead of
-- creating a duplicate tenant and risking foreign-key/data drift.
DO $$
DECLARE
  v_tenant_id uuid := '3d056e5f-1f82-45ba-8cf5-0750c949a9c9';
  v_branch_count integer;
BEGIN
  SELECT count(*) INTO v_branch_count
  FROM public.branches
  WHERE tenant_id = v_tenant_id;

  IF v_branch_count <> 1 THEN
    RAISE EXCEPTION 'Blitz Physio promotion requires exactly one branch; found %', v_branch_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = v_tenant_id
      AND slug = 'default'
  ) THEN
    RAISE EXCEPTION 'Expected default tenant was not found; refusing to rename an unexpected tenant';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE slug = 'blitz-physio'
      AND id <> v_tenant_id
  ) THEN
    RAISE EXCEPTION 'The blitz-physio tenant slug is already in use';
  END IF;

  UPDATE public.tenants
  SET name = 'Blitz Physio',
      slug = 'blitz-physio',
      updated_at = now()
  WHERE id = v_tenant_id;
END;
$$;
