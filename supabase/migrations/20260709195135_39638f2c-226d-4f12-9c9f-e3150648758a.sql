
-- =========================================================================
-- Settings vertical slice — Migration 1 (SHADOW MODE)
-- Purely additive. No existing object is altered.
-- =========================================================================

-- 1. Catalog: five new Settings permission keys (per FINAL_PERMISSION_SPECIFICATION §31).
INSERT INTO public.authz_permissions
  (key, group_key, display_name, description, risk_level, default_scope, metadata, deprecated, introduced_in)
VALUES
  ('settings.org.update',          'settings', 'Update organization settings',
   'Modify org-wide configuration (name, address, tax id, org policies).',
   'high',     'global',
   jsonb_build_object('approval','dual','audit','immutable','actors', jsonb_build_array('org_admin','super_admin')),
   false, 'R5-settings-slice'),
  ('settings.branch.update',       'settings', 'Update branch settings',
   'Modify branch-scoped configuration (non-financial fields).',
   'medium',   'branch',
   jsonb_build_object('approval','single','audit','standard','actors', jsonb_build_array('branch_manager')),
   false, 'R5-settings-slice'),
  ('settings.pricing.update',      'settings', 'Update pricing catalog',
   'Modify service prices and pricing rules.',
   'high',     'global',
   jsonb_build_object('approval','dual','audit','immutable','actors', jsonb_build_array('accountant','org_admin')),
   false, 'R5-settings-slice'),
  ('settings.catalog.update',      'settings', 'Update service catalog',
   'Modify service catalog entries (non-price attributes).',
   'medium',   'global',
   jsonb_build_object('approval','single','audit','standard','actors', jsonb_build_array('org_admin')),
   false, 'R5-settings-slice'),
  ('settings.integrations.manage', 'settings', 'Manage integrations',
   'Configure external integrations (excluding secrets).',
   'high',     'global',
   jsonb_build_object('approval','dual','audit','immutable','actors', jsonb_build_array('super_admin','org_admin')),
   false, 'R5-settings-slice')
ON CONFLICT (key) DO NOTHING;

-- 2. Bundle mapping — parity with today's behavior.
--    Legacy bundle keys per Wave 1 seed: bundle.role.<legacy_role>.
--    admin      -> all 5 (admin already implies "everything").
--    manager    -> settings.branch.update.
--    accountant -> settings.pricing.update.
--    Others: no new grants (matches current effective access).
DO $$
DECLARE
  admin_bundle text := 'bundle.role.admin';
  mgr_bundle   text := 'bundle.role.manager';
  acct_bundle  text := 'bundle.role.accountant';
BEGIN
  -- admin: every new key
  INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
  SELECT admin_bundle, k
  FROM (VALUES
    ('settings.org.update'),
    ('settings.branch.update'),
    ('settings.pricing.update'),
    ('settings.catalog.update'),
    ('settings.integrations.manage')
  ) AS v(k)
  WHERE EXISTS (SELECT 1 FROM public.authz_bundles b WHERE b.key = admin_bundle)
  ON CONFLICT DO NOTHING;

  -- manager: branch.update only
  INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
  SELECT mgr_bundle, 'settings.branch.update'
  WHERE EXISTS (SELECT 1 FROM public.authz_bundles b WHERE b.key = mgr_bundle)
  ON CONFLICT DO NOTHING;

  -- accountant: pricing.update only
  INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
  SELECT acct_bundle, 'settings.pricing.update'
  WHERE EXISTS (SELECT 1 FROM public.authz_bundles b WHERE b.key = acct_bundle)
  ON CONFLICT DO NOTHING;
END $$;

-- 3. Shadow-decision log: append-only.
CREATE TABLE IF NOT EXISTS public.authz_shadow_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slice           text NOT NULL,                   -- e.g. 'settings'
  permission_key  text NOT NULL,
  user_id         uuid NOT NULL,
  decision_legacy boolean NOT NULL,
  decision_new    boolean NOT NULL,
  match           boolean GENERATED ALWAYS AS (decision_legacy = decision_new) STORED,
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authz_shadow_decisions_slice_created_idx
  ON public.authz_shadow_decisions (slice, created_at DESC);
CREATE INDEX IF NOT EXISTS authz_shadow_decisions_mismatch_idx
  ON public.authz_shadow_decisions (slice, created_at DESC) WHERE match = false;

-- Grants: only auditors and admins read; only the SECURITY DEFINER RPC writes.
-- Deliberately no INSERT/UPDATE/DELETE grant to `authenticated`.
GRANT SELECT ON public.authz_shadow_decisions TO authenticated;
GRANT ALL    ON public.authz_shadow_decisions TO service_role;

ALTER TABLE public.authz_shadow_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shadow log: admins read all"
  ON public.authz_shadow_decisions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Shadow-decision recorder.
--    Records the (legacy, new) pair. Never grants or denies anything.
CREATE OR REPLACE FUNCTION public.authz_record_shadow_decision(
  _slice          text,
  _permission_key text,
  _decision_legacy boolean,
  _decision_new   boolean,
  _context        jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN; -- silently ignore unauth calls; shadow logging only for real sessions
  END IF;
  IF _slice IS NULL OR _permission_key IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.authz_shadow_decisions
    (slice, permission_key, user_id, decision_legacy, decision_new, context)
  VALUES
    (_slice, _permission_key, _uid, _decision_legacy, _decision_new,
     COALESCE(_context, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,jsonb) TO authenticated, service_role;

COMMENT ON TABLE public.authz_shadow_decisions IS
  'Append-only log of (legacy vs new) authorization decisions during vertical-slice shadow mode. No cutover uses this table; parity verification only.';
COMMENT ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,jsonb) IS
  'Records one shadow-mode authorization decision. Never affects access; never returns a decision. Rows are read only by admins to prove parity before cutover.';
