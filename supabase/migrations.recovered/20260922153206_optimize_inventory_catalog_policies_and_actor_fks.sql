-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260922153206
-- name: optimize_inventory_catalog_policies_and_actor_fks
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.


DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('products','suppliers','product_categories')
      AND (
        COALESCE(qual,'') LIKE '%auth.uid()%'
        OR COALESCE(with_check,'') LIKE '%auth.uid()%'
      )
  LOOP
    new_qual := CASE WHEN p.qual IS NULL THEN NULL ELSE replace(p.qual,'auth.uid()','(SELECT auth.uid())') END;
    new_check := CASE WHEN p.with_check IS NULL THEN NULL ELSE replace(p.with_check,'auth.uid()','(SELECT auth.uid())') END;

    stmt := format('ALTER POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
    IF new_qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)',new_qual); END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)',new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_by
  ON public.inventory_transactions(created_by);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by
  ON public.purchase_orders(created_by);

