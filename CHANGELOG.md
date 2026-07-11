# Changelog

## [Unreleased]

### Patients Authorization Slice — Shadow (Ready-for-Cutover)

**Additions**
- New `src/lib/authz/patientsShadowProbe.ts` — telemetry-only probe covering
  `patients.view`, `patients.create`, `patients.edit`, `patients.delete`,
  `patients.export`. Legacy map is 1:1 with the `patients` module actions.
- `PatientsShadowProbeMount` in `PermissionRoute` fires for every
  `/patients/*` path (including denied outcomes) so `staff` produces the
  observations required by `at_least_one_denied_role_exercised` and
  `negative_matrix_complete`.
- New migration: adds a `patients` row to `authz_shadow_slice_gate` with
  canonical bundle keys (`bundle.role.admin`, `bundle.role.manager`,
  `bundle.role.receptionist`, `bundle.role.staff`); creates
  `public.v_authz_shadow_matrix_patients`; extends
  `public.v_authz_shadow_exit_criteria` with a `matrix_patients` CTE and
  a `patients` branch. Settings branch preserved byte-for-byte.
- Playwright: `setup:shadow-patients`, `patients-shadow-walk`,
  `patients-shadow-validate` projects and matching setup/walk/validate
  specs. Runs under the new `patients-shadow-qa.yml` GitHub Actions
  workflow (same structure as `settings-shadow-qa.yml`).
- Vitest baselines: `patients.slice.parity.test.ts` locks the legacy
  per-role matrix; `patientsShadowProbe.noninfluence.test.ts` proves the
  probe cannot affect `AuthorizationService.can`.
- Registered `patients` in `COMPLETED_SLICES` (status `shadow`) so the CI
  invariant test is armed for Migration 2.

**Design notes**
- No intentional expansions registered. Patients keys align with legacy
  `patients` module actions, so `expected_decision = legacy` for every
  cell in the matrix. Parity is expected to be perfect on first run.
- Legacy authorization remains active. RLS, RPCs, bundles, and the
  permission catalog are unchanged. The Settings slice, its probe, its
  matrix view, its gate row, and its workflow are untouched.

**Exit criteria targets (patients slice)**
- `regressions = 0`
- `unexpected_expansions = 0`
- `parity_green = true`
- `every_key_exercised = true`
- `every_granting_bundle_exercised = true`
- `every_denying_bundle_exercised = true`
- `every_write_role_exercised = true`
- `at_least_one_denied_role_exercised = true`
- `ready_for_cutover = true`

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