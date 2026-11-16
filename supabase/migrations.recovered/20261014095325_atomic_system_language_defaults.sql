-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261014095325
-- name: atomic_system_language_defaults
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Candidate only: review existing global settings scope before individual release.
-- Abort rather than repair unexpected data. No existing language is rewritten.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.system_languages WHERE is_default) > 1
     OR EXISTS (SELECT 1 FROM public.system_languages WHERE is_default AND NOT is_active) THEN
    RAISE EXCEPTION 'Language defaults require reviewed reconciliation before migration';
  END IF;
END $$;

CREATE UNIQUE INDEX system_languages_one_default
  ON public.system_languages (is_default) WHERE is_default;
ALTER TABLE public.system_languages ADD CONSTRAINT system_languages_default_active
  CHECK (NOT is_default OR is_active);

CREATE FUNCTION public.set_default_system_language(_language_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_permission(auth.uid(), 'settings.edit') IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Language settings permission required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.system_languages.default', 0));
  PERFORM 1 FROM public.system_languages WHERE id = _language_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active language unavailable';
  END IF;
  UPDATE public.system_languages SET is_default = false WHERE is_default AND id <> _language_id;
  UPDATE public.system_languages SET is_default = true WHERE id = _language_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Language change not confirmed';
  END IF;
  RETURN _language_id;
END $$;

CREATE FUNCTION public.create_system_language(
  _code text, _name_en text, _name_ar text, _is_rtl boolean, _is_default boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_permission(auth.uid(), 'settings.edit') IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Language settings permission required';
  END IF;
  IF _code IS NULL OR pg_catalog.btrim(_code) = ''
     OR _name_en IS NULL OR pg_catalog.btrim(_name_en) = ''
     OR _name_ar IS NULL OR pg_catalog.btrim(_name_ar) = ''
     OR _is_rtl IS NULL OR _is_default IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Language fields required';
  END IF;
  -- Insert and optional promotion are one statement transaction. A duplicate
  -- code or failed promotion cannot clear the previous default or leave a row.
  IF _is_default THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.system_languages.default', 0));
  END IF;
  INSERT INTO public.system_languages(code, name_en, name_ar, is_active, is_default, is_rtl)
    VALUES (pg_catalog.btrim(_code), pg_catalog.btrim(_name_en), pg_catalog.btrim(_name_ar), true, false, _is_rtl)
    RETURNING id INTO v_id;
  IF _is_default THEN PERFORM public.set_default_system_language(v_id); END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.set_default_system_language(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_system_language(text,text,text,boolean,boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_default_system_language(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_system_language(text,text,text,boolean,boolean) TO authenticated;
