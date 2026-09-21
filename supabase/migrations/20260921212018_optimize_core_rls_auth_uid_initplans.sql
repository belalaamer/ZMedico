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
    WHERE schemaname = 'public'
      AND tablename IN (
        'patients','appointments','invoices','payments',
        'treasury','treasury_transactions','medical_records','reminders'
      )
      AND (
        COALESCE(qual, '') LIKE '%auth.uid()%'
        OR COALESCE(with_check, '') LIKE '%auth.uid()%'
      )
  LOOP
    new_qual := CASE WHEN p.qual IS NULL THEN NULL ELSE replace(p.qual, 'auth.uid()', '(SELECT auth.uid())') END;
    new_check := CASE WHEN p.with_check IS NULL THEN NULL ELSE replace(p.with_check, 'auth.uid()', '(SELECT auth.uid())') END;

    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
  END LOOP;
END
$$;
