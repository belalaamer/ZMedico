DO $$
DECLARE
  r record;
  stmt text;
  new_qual text;
  new_check text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('inventory','inventory_transactions','purchase_orders','purchase_order_items')
      AND (
        COALESCE(qual,'') LIKE '%auth.uid()%'
        OR COALESCE(with_check,'') LIKE '%auth.uid()%'
      )
  LOOP
    new_qual := CASE
      WHEN r.qual IS NULL THEN NULL
      ELSE replace(r.qual, 'auth.uid()', '(SELECT auth.uid())')
    END;
    new_check := CASE
      WHEN r.with_check IS NULL THEN NULL
      ELSE replace(r.with_check, 'auth.uid()', '(SELECT auth.uid())')
    END;

    stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF new_qual IS NOT NULL THEN stmt := stmt || ' USING (' || new_qual || ')'; END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || new_check || ')'; END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
