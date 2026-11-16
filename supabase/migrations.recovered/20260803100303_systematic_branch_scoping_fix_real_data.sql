-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260803100303
-- name: systematic_branch_scoping_fix_real_data
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.


DO $$
DECLARE
  r RECORD;
  new_qual text;
  new_check text;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.qual, p.with_check
    FROM pg_policies p
    JOIN information_schema.columns c
      ON c.table_schema = p.schemaname AND c.table_name = p.tablename AND c.column_name = 'branch_id'
    WHERE p.schemaname = 'public'
      AND (p.qual ilike '%has_role%' or p.qual ilike '%has_permission%')
      AND p.qual not ilike '%branch%'
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;
    IF new_qual IS NOT NULL THEN
      new_qual := format('(%s) AND user_has_branch_access(%I.branch_id)', new_qual, r.tablename);
    END IF;
    IF new_check IS NOT NULL AND new_check NOT ILIKE '%branch%' THEN
      new_check := format('(%s) AND user_has_branch_access(%I.branch_id)', new_check, r.tablename);
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    IF r.cmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)', r.policyname, r.tablename, COALESCE(new_check, new_qual));
    ELSIF new_qual IS NOT NULL AND new_check IS NOT NULL THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s) WITH CHECK (%s)', r.policyname, r.tablename, r.cmd, new_qual, new_check);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s)', r.policyname, r.tablename, r.cmd, COALESCE(new_qual, new_check));
    END IF;
  END LOOP;
END $$;

