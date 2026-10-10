-- ZMED-207 candidate: direct wallet mutations are administrative operations.
-- Ordinary billing/referral operations continue through existing guarded triggers.
-- No role grants, RLS changes, trigger changes or financial data repair.
DO $direct_wallet$
DECLARE
  routine oid := 'public.apply_wallet_tx(uuid,public.wallet_tx_type,numeric,text,uuid,text,text,uuid)'::regprocedure;
  original text;
  guarded text;
  original_acl aclitem[];
  original_owner oid;
  original_definer boolean;
  original_config text[];
  entry text := $entry$  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required' USING ERRCODE = '42501';
  END IF;$entry$;
BEGIN
  SELECT pg_get_functiondef(p.oid),p.proacl,p.proowner,p.prosecdef,p.proconfig
    INTO original,original_acl,original_owner,original_definer,original_config
    FROM pg_proc p WHERE p.oid=routine;
  IF md5(original) NOT IN (
      'ce34cf6d3df9b58c89694f52509dac6e', --192
      'c432fe02b9a614fdf63da8725a4fa466', --192+196
      '3f8872447a76d3fd4db578d0269125b5', --192+200
      '70e1ab64f5f41e629213e8a4a8b432ce'  --192+196+200
    ) THEN
    RAISE EXCEPTION 'Reviewed wallet prerequisite drift; review before applying direct-call protection';
  END IF;
  IF (length(original)-length(replace(original,entry,'')))/length(entry)<>1 THEN
    RAISE EXCEPTION 'Exact authenticated wallet entry changed';
  END IF;
  guarded := replace(original,entry,entry || $guard$

  -- Server-derived trigger context is not a client claim or extra permission.
  -- Existing payment/referral callbacks retain their own checks; direct staff
  -- calls cannot mint/spend wallet value by choosing a different enum/reference.
  IF pg_catalog.pg_trigger_depth() = 0 AND NOT (
    public.has_role(_uid,'admin'::public.app_role)
    OR public.has_role(_uid,'system_owner'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Direct wallet changes require an administrator; use the authorized payment or referral workflow'
      USING ERRCODE = '42501';
  END IF;
$guard$);
  IF guarded=original OR strpos(guarded,'pg_catalog.pg_trigger_depth() = 0')=0 THEN
    RAISE EXCEPTION 'Direct-call guard insertion failed';
  END IF;
  EXECUTE guarded;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=routine AND
     (p.proacl IS DISTINCT FROM original_acl OR p.proowner IS DISTINCT FROM original_owner
      OR p.prosecdef IS DISTINCT FROM original_definer OR p.proconfig IS DISTINCT FROM original_config)) THEN
    RAISE EXCEPTION 'Wallet ACL/owner/security/search_path must not change';
  END IF;
END;
$direct_wallet$;
