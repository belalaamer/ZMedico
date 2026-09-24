-- Runtime Data API roles should be able to use the public schema, but they
-- must not be able to create arbitrary objects inside it. This is especially
-- important while legacy SECURITY DEFINER functions are being migrated from
-- search_path=public to an empty, fully-qualified search_path.
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;
