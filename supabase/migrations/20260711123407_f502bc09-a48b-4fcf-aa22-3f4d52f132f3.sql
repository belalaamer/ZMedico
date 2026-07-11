-- 1) Close dead-permission gap: accountant owns settings.pricing.update but lacks settings.view (the prerequisite for entering /settings/*).
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
VALUES ('bundle.role.accountant', 'settings.view')
ON CONFLICT DO NOTHING;

-- 2) Register intentional new-model expansions so shadow parity report stops classifying canonical grants as unexpected.
INSERT INTO public.authz_shadow_expected_expansions (slice, permission_key, actor_role, reason, spec_reference)
VALUES
  ('settings', 'settings.branch.update',  'manager'::app_role,    'Manager owns branch operations oversight per FINAL_PERMISSION_SPECIFICATION §31 (bundle.role.manager).',    'docs/business/FINAL_PERMISSION_SPECIFICATION.md#settings'),
  ('settings', 'settings.pricing.update', 'accountant'::app_role, 'Accountant owns pricing per FINAL_PERMISSION_SPECIFICATION §31 (bundle.role.accountant).',                 'docs/business/FINAL_PERMISSION_SPECIFICATION.md#settings'),
  ('settings', 'settings.view',           'accountant'::app_role, 'Accountant requires settings.view as coarse-grained prerequisite to reach settings.pricing.update.',       'docs/business/FINAL_PERMISSION_SPECIFICATION.md#settings')
ON CONFLICT (slice, permission_key, actor_role) DO NOTHING;