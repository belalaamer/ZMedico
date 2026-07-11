# Changelog

## [Unreleased]

### Settings Authorization Slice — Cutover Ready

**Fixes applied**
- Unified the `expected_decision` calculation in `public.v_authz_shadow_matrix_settings`
  so intentional grants registered in `authz_shadow_expected_expansions`
  (manager → `settings.branch.update`, accountant → `settings.pricing.update`)
  are no longer reported as regressions.
- Mounted the Settings shadow probe unconditionally for `/settings/*` paths in
  `PermissionRoute` via a dedicated `SettingsShadowProbeMount`, so denied roles
  (e.g. `staff`) still emit shadow observations without changing the
  authorization outcome.
- Corrected `authz_shadow_slice_gate` metadata for the `settings` slice to use
  canonical bundle keys (`bundle.role.admin`, `bundle.role.manager`,
  `bundle.role.accountant`, `bundle.role.staff`) instead of bare role names,
  unblocking `every_granting_bundle_exercised` and `every_denying_bundle_exercised`.
- Added coarse `settings.view` to the accountant default role permissions so the
  role can reach `/settings/*` to exercise `settings.pricing.update`, matching
  the canonical `bundle.role.accountant` grant.

**Root causes resolved**
- Matrix and parity views used different definitions of "expected", producing
  false regressions for legitimately expanded bundles.
- The shadow probe was mounted inside `SettingsLayout`, which never rendered for
  roles denied by `PermissionRoute`, leaving `staff` with zero observations.
- Slice-gate `required_*_bundles` stored role names, but exit criteria compared
  against canonical bundle keys, so containment could never be satisfied.

**Final authorization behavior**
- `settings.view` remains the prerequisite for entering any `/settings/*` route.
- Fine-grained keys (`settings.pricing.update`, `settings.branch.update`, …) are
  enforced at the action level by the canonical `AuthorizationService`.
- No RLS, RPC, bundle, or permission-catalog changes.

**Verification**
- Settings Shadow QA pipeline: 9/9 Playwright tests passed.
- Shadow parity report: `regressions = 0`, `unexpected_expansions = 0`,
  `parity_green = true`.
- Exit criteria: all booleans `true`, including `ready_for_cutover = true`,
  across 4 unique users (admin, manager, accountant, staff).