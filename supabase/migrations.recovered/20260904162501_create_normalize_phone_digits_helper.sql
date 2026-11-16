-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260904162501
-- name: create_normalize_phone_digits_helper
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

CREATE OR REPLACE FUNCTION public.normalize_phone_digits(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_phone IS NULL OR trim(p_phone) = '' THEN NULL
    WHEN left(regexp_replace(p_phone, '[^0-9]', '', 'g'), 1) = '0'
      THEN '2' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    ELSE regexp_replace(p_phone, '[^0-9]', '', 'g')
  END;
$function$;
