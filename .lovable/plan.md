## Patients Slice — Shadow-Auth Migration (mirror of Settings)

Repeats, without deviation, the process that carried the Settings slice to `ready_for_cutover = true`. Legacy authorization stays active; only shadow instrumentation and gate metadata are added.

### Canonical permission keys (patients slice)

Direct mirror of the legacy `patients` module actions — no aggregation, no renaming.

- `patients.view`
- `patients.create`
- `patients.edit`
- `patients.delete`
- `patients.export`

Roles participating in the gate (based on `authz_role_bundles` + `role_permissions`):
- Write roles: `admin`, `manager`, `receptionist`
- Denied role: `staff` (no patients access at all)

Intentional expansions: **none required.** Legacy `role_permissions` and new bundle grants match key-for-key; the parity report will show zero unexpected expansions without any registration.

### Scope of changes

1. **Frontend** — Patients shadow probe + PermissionRoute mount for `/patients/*`.
2. **Backend** — New matrix view for patients, gate row, and one added branch inside `v_authz_shadow_exit_criteria`.
3. **Tests** — Playwright shadow walk + validate specs for patients; Vitest parity baseline.
4. **CI** — New GitHub Actions workflow mirroring `settings-shadow-qa.yml`.
5. **Registry** — Add `patients` entry (status `shadow`) to `COMPLETED_SLICES`.
6. **CHANGELOG** — New entry.

The Settings slice, its probe, its matrix view, its gate row, and its workflow are untouched.

### Technical details

**Frontend**

- New `src/lib/authz/patientsShadowProbe.ts` — copy of `settingsShadowProbe.ts` with `SLICE = "patients"`, keys `patients.view/create/edit/delete/export`, legacy map:
  - `patients.view → (patients, view)`
  - `patients.create → (patients, create)`
  - `patients.edit → (patients, edit)`
  - `patients.delete → (patients, delete)`
  - `patients.export → (patients, export)`
  Session dedup is local to this file.
- New `PatientsShadowProbeMount` in `src/components/PermissionRoute.tsx`, mounted whenever `pathname.startsWith("/patients")` — mirrors the settings pattern so denied roles still emit observations without changing the gate outcome.
- Mount the probe once from `src/pages/patients/Patients.tsx` and `PatientProfile.tsx` (dedup guarantees it fires once per user/path). This mirrors the SettingsLayout mount.

**Backend (one migration)**

- Insert row into `authz_shadow_slice_gate` for slice `patients` with:
  - `required_keys = {patients.view, patients.create, patients.edit, patients.delete, patients.export}`
  - `required_write_roles = {admin, manager, receptionist}`
  - `required_denied_roles = {staff}`
  - `required_granting_bundles = {bundle.role.admin, bundle.role.manager, bundle.role.receptionist}`
  - `required_denying_bundles = {bundle.role.staff}`
- Create `public.v_authz_shadow_matrix_patients` — exact structural copy of `v_authz_shadow_matrix_settings`, filtered to `slice = 'patients'`. Expected decision is `legacy_role_permissions_match OR registered_expected_expansion` (same expression).
- `CREATE OR REPLACE VIEW public.v_authz_shadow_exit_criteria` — add a parallel `matrix_patients` CTE and a `WHEN (g.slice = 'patients')` branch for the four matrix booleans and the `ready_for_cutover` conjunction. The existing `settings` branch is preserved byte-for-byte.
- Standard `GRANT SELECT` on the new view to `authenticated` and `service_role` (matches the settings matrix grants).

No RLS, RPC, bundle, or permission-catalog changes.

**Tests**

- `tests/playwright/helpers/patientsShadow.ts` — exports `PATIENTS_ROUTES = ["/patients"]` and a helper to open the first row. (Reuses `getRoleCreds` + `shadowStorageState` from `shadowRoles.ts`; no changes to existing helpers.)
- `tests/playwright/patients.shadow.spec.ts` — for each role, load storage state, visit `/patients`, click the first patient row if visible to hit the profile, click "New / Add" trigger, escape, wait for probe RPCs.
- `tests/playwright/patients.shadow.validate.spec.ts` — queries `v_authz_shadow_parity_report` (row where `slice='patients'`), `v_authz_shadow_matrix_patients`, `v_authz_shadow_key_coverage`, `v_authz_shadow_exit_criteria` (row where `slice='patients'`); asserts `regressions=0`, `unexpected_expansions=0`, `ready_for_cutover=true`.
- `src/lib/authz/patients.slice.parity.test.ts` — Vitest baseline mirroring `settings.slice.parity.test.ts`. Because patient keys align with legacy actions, this baseline asserts the exact legacy matrix per role (no admin-only asymmetry needed).
- `src/lib/authz/patientsShadowProbe.noninfluence.test.ts` — mirror of the settings noninfluence test.

**CI**

- `.github/workflows/patients-shadow-qa.yml` — copy of `settings-shadow-qa.yml`, replace `TEST_ACCOUNTANT_*` env vars with `TEST_RECEPTIONIST_*`, and switch playwright projects to `setup:shadow-patients`, `patients-shadow-walk`, `patients-shadow-validate`.
- `playwright.config.ts` — add `SHADOW_PATIENTS_ROLES = ["admin","manager","receptionist","staff"]`, a `setup:shadow-patients` project, a `patients-shadow-walk` project, and a `patients-shadow-validate` project. Existing `setup:shadow` and settings projects untouched.
- `tests/playwright/patients.setup.ts` — mirror of `settings.setup.ts` iterating `SHADOW_PATIENTS_ROLES`.

**Registry & CHANGELOG**

- Add `patients` entry (status `shadow`) to `COMPLETED_SLICES` with `ownedPaths = ["src/pages/patients"]`, `canonicalKeys = [patients.view/create/edit/delete/export]`, `moduleGuardsForbidden = ["patients"]`, forbidden legacy pattern for `can('patients', ...)` and `<Can module="patients">`. `status: "shadow"` keeps the invariant inert until Migration 2.
- Append a `## [Unreleased] — Patients Shadow Slice` block to `CHANGELOG.md`.

### File list

New:
- `src/lib/authz/patientsShadowProbe.ts`
- `src/lib/authz/patientsShadowProbe.noninfluence.test.ts`
- `src/lib/authz/patients.slice.parity.test.ts`
- `tests/playwright/helpers/patientsShadow.ts`
- `tests/playwright/patients.setup.ts`
- `tests/playwright/patients.shadow.spec.ts`
- `tests/playwright/patients.shadow.validate.spec.ts`
- `.github/workflows/patients-shadow-qa.yml`
- One new migration under `supabase/migrations/` (gate row + matrix view + exit-criteria view replace).

Edited:
- `src/components/PermissionRoute.tsx` — add `PatientsShadowProbeMount` beside the settings mount.
- `src/pages/patients/Patients.tsx` and `src/pages/patients/PatientProfile.tsx` — `useEffect` mount of `usePatientsShadowProbe(pathname)`.
- `playwright.config.ts` — add patients projects and role list.
- `src/lib/authz/slices/completedSlices.ts` — add `patients` shadow entry.
- `CHANGELOG.md` — new section.

### Verification

1. Migration applied, view grants confirmed via `pg_views` inspection.
2. Vitest run — parity + noninfluence tests green.
3. Manual `SELECT * FROM v_authz_shadow_exit_criteria WHERE slice='patients'` after workflow run — confirm all booleans `true`.
4. Report handed back in the same seven-section structure as the Settings completion report.

### Risks & rollback

- **Low risk.** All additions are telemetry-only; no legacy authorization outcome changes. `PermissionRoute` gets a second mount path that mirrors the proven settings pattern.
- **Rollback** = `DELETE FROM authz_shadow_slice_gate WHERE slice='patients'; DROP VIEW public.v_authz_shadow_matrix_patients; CREATE OR REPLACE VIEW v_authz_shadow_exit_criteria` (restore pre-patch definition) + revert the code files listed above.

### Out of scope

- No changes to Settings slice, other slices, RLS, RPCs, bundles, or permission catalog.
- No Migration 2 (cutover) for patients — this run stops at `ready_for_cutover = true` in shadow, exactly like Settings did.
