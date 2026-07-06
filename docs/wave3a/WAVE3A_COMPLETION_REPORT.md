# Wave 3A — Admin-Only Policy Family Migration · Completion Report

**Waves closed:** Wave 3A (this) — extends Wave 3 Pilot pattern (pure `has_role(admin)` → `has_permission`).
**Total migrated in Wave 3A:** 29 policies · 4 batches · 0 authorization drift.
**Cumulative across Wave 3 + 3A:** 36 policies migrated to the new model.

## 1. Batches Executed

| # | Permission key       | Cmd    | # policies | Migration ID              | Harness | Diff |
|---|---------------------|--------|-----------|---------------------------|---------|------|
| A | `settings.edit`     | ALL/UPDATE | 20    | `20260706-080447-591758`  | pass    | 0    |
| B | `settings.export`   | SELECT | 6         | `20260706-080505-958594`  | pass    | 0    |
| C | `settings.create`   | INSERT | 2         | `20260706-080520-326164`  | pass    | 0    |
| D | `settings.delete`   | DELETE | 1         | `20260706-080533-539759`  | pass    | 0    |

Each batch was submitted independently and independently rollback-able. Harness (`bash scripts/authz/run_all.sh`) executed after every batch and returned `0 RLS + 0 RPC changes; 0 unlabeled`.

## 2. Policies Migrated (29)

**Batch A — settings.edit (20)**
`allowed_signup_emails."admins manage allowlist"`, `appointment_settings.as_admin`,
`authz_bundle_implies."authz_bundle_implies admin write"`, `authz_bundle_permissions."authz_bundle_permissions admin write"`,
`authz_bundles."authz_bundles admin write"`, `authz_permissions."authz_permissions admin write"`,
`authz_role_bundles."authz_role_bundles admin write"`, `branches.branches_admin_all`,
`clinic_profile.cp_admin`, `clinic_settings.cs_admin`, `departments.dept_admin`,
`notification_settings.ns_admin`, `report_schedules.rs_admin`,
`role_permissions."role_permissions update admin"`, `services.sv_admin`,
`staff_positions.pos_admin`, `staff_profiles.staff_admin`, `tenants.tenants_admin_all`,
`user_roles.roles_admin_manage`, `work_schedules.ws_admin`

**Batch B — settings.export (6, SELECT)**
`allowed_signup_emails.allowed_signup_emails_select_none`, `audit_logs.al_select_admin`,
`notification_settings.ns_select_admin`, `report_schedules.rs_select`,
`system_backups.sb_read_admin`, `user_activity_logs.ual_select_admin`

**Batch C — settings.create (2, INSERT)**
`role_permissions."role_permissions insert admin"`, `system_backups.sb_insert_admin`

**Batch D — settings.delete (1, DELETE)**
`role_permissions."role_permissions delete admin"`

## 3. Pattern Transformation

| | Old pattern                              | New pattern                                           |
|-|-------------------------------------------|-------------------------------------------------------|
| USING/CHECK | `has_role(auth.uid(), 'admin'::app_role)` | `public.has_permission(auth.uid(), '<perm_key>')`     |

Semantic equivalence: every `settings.*` permission used here is admin-exclusive in the current bundle graph (verified in §4). `has_permission()` short-circuits on `has_role(_,'admin')`, so the truth set is identical to the original.

## 4. Permission Keys Used (bundle-graph reach)

| Key             | Reaching roles |
|-----------------|----------------|
| `settings.edit` | admin (only)   |
| `settings.export` | admin (only) |
| `settings.create` | admin (only) |
| `settings.delete` | admin (only) |

No permission catalog, bundle, or role change was performed. `settings.export` is used as the platform's admin-exclusive read guard (technical marker — see §11 tech debt).

## 5. Regression Results

| Check                              | Result |
|------------------------------------|--------|
| Authorization Regression Harness   | pass (exit 0) after every batch |
| Golden Baseline diff (RLS)         | 0 changed cells across 3,392 |
| RPC regression                     | 0 changed cells across 368 |
| Unlabeled changes                  | 0 |
| Existing unit tests                | unaffected (RLS-only migration; no frontend/edge/function changes) |

## 6. Performance Comparison

- All 21 write tables affected are small config/IAM/catalog tables. `EXPLAIN (COSTS OFF)` on representative queries returns identical `Seq Scan` / `Index Scan` plans pre- and post-migration; RLS predicates are inlined only on write paths where the auth function cost dominates.
- `has_permission` short-circuits on `has_role(_, 'admin')` for admin callers → identical single index lookup on `user_roles(user_id, role)`.
- Non-admin callers: bounded recursive CTE over the bundle graph (6 bundles, 4 edges) → returns false without materialising the CTE beyond the first non-match on the target permission key.
- No `EXPLAIN` regression observed. No user-observable latency change on any admin console page in preview.

## 7. Rollback SQL

Per-batch scripts committed:

- `docs/wave3a/PILOT_ROLLBACK_settings_edit.sql`
- `docs/wave3a/PILOT_ROLLBACK_settings_export.sql`
- `docs/wave3a/PILOT_ROLLBACK_settings_create.sql`
- `docs/wave3a/PILOT_ROLLBACK_settings_delete.sql`

Each script is transactional and idempotent: drops the migrated policies and re-creates the originals verbatim.

## 8. Remaining `has_role()` Usages

- 250 policies still reference `has_role(...)` in some form (of 362 total public policies).
- 197 of those still reference `has_role(admin)` — none of them are pure admin-only (all are compound, ownership-mixed, branch-mixed, or state-mixed patterns explicitly excluded from Wave 3A).

**Remaining pure-admin candidates:** 0.  Wave 3A has fully drained this pattern within the safe scope. Excluded pure-admin policies still exist inside forbidden clusters (finance / payroll / clinical / inventory-transaction / stateful) — 72 policies — deferred to future waves under their respective governance.

## 9. Remaining Policy Families (roadmap)

| Family                                          | # policies | Status  |
|-------------------------------------------------|------------|---------|
| Pure `has_permission` (new model)               | 36         | done    |
| `has_role(admin) OR has_role(other_role)` — compound | 73    | next    |
| `has_role(admin) OR auth.uid()=owner` — ownership     | 24    | after next |
| `has_role(admin) OR user_has_branch_access(...)` — branch-scope | 15 | after next |
| `has_role(other_role)` without admin (single/compound) | 52 | interleaved |
| Pure ownership (`auth.uid()=owner`, no role)    | 10         | later   |
| Public/system rows (`true`/`false`/no auth)     | 36         | out-of-scope |
| Other (state, EXISTS subquery, mixed)           | 116        | later (stateful family) |

## 10. Migration Coverage

- **Admin-only pattern coverage in safe scope:** 100% (36/36 eligible policies migrated across Waves 3 + 3A).
- **Overall RLS coverage under new model:** 36 / 362 = **9.9%** of all public policies.
- **Coverage of tables with at least one migrated policy:** 28 / 106 = **26.4%**.

## 11. Quality Gates

| Gate                                    | Result |
|-----------------------------------------|--------|
| 0 authorization drift                   | pass   |
| 0 unlabeled changes                     | pass   |
| 100% baseline parity                    | pass   |
| Rollback verified (scripts checked in, syntax valid, transactional) | pass |
| No new SECURITY DEFINER findings        | pass — 26 warnings unchanged from pre-Wave-3 baseline; all pre-existing on unrelated functions |
| No permission catalog modifications     | pass   |
| No frontend behavior change             | pass — no UI/component/edge/function edits |

### Known Technical Debt
- `settings.export` is used as the admin-only read guard for `audit_logs`, `user_activity_logs`, `allowed_signup_emails`, `system_backups`, `notification_settings.ns_select_admin`, `report_schedules.rs_select`. Truth set is identical to admin, but the key is semantically about export, not read. Recommend introducing `audit.view` / `iam.view` / `backups.view` keys in a future catalog wave (out of scope for Wave 3A per rules).
- IAM writes (`authz_*`, `role_permissions`, `user_roles`) are guarded by `settings.edit` for pattern uniformity. Recommend a dedicated `iam.manage` key in the next catalog wave.

## 12. Recommendation for the Next Family

**Recommended:** Ownership family (`has_role(admin) OR auth.uid() = owner_col`) — 24 policies.

Rationale:
1. Well-scoped (single new predicate: ownership) and easily proven equivalent (`has_permission('<key>') OR auth.uid() = owner_col`).
2. Smaller than the compound-role family (24 vs 73) — better validation surface before the largest family.
3. Ownership predicates are already modelled by the analyzer (`own` cell class), so parity is machine-verifiable without any harness change.
4. Avoids the branch-scope family, which requires resolving `user_has_branch_access(...)` fixtures and is best paired with a scope-aware pilot of its own.

**Not recommended next:** Branch-scoped (needs its own dedicated pilot with branch fixtures) and Stateful (requires per-workflow guards and business-rule review).

Wave 3A stopped as instructed — no further families started. Awaiting review.
