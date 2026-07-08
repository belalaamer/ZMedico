# Runtime Wave R1 — Authorization Consumer Migration Strategy

**Status:** Documentation only. No SQL, no code, no migrations.
**Scope:** Canonical strategy for migrating every runtime consumer of
authorization off the legacy path (`role_permissions` +
`DEFAULT_PERMISSIONS` + `has_role`) onto the new architecture
(`authz_permissions` catalog + `has_permission` + `authz_versions` +
`authz_current_state`).
**Method:** measured inventory from the M1 gap assessment, grouped
into independent runtime waves, sequenced by security impact.

---

## 1. Runtime Consumer Inventory

Legend: **Complexity** S/M/L/XL · **Risk** LOW/MED/HIGH/CRITICAL ·
**Rollback** trivial/simple/moderate/hard · **Priority** P0…P3.

### 1.1 Frontend

| Consumer | Current source | Target source | Complexity | Regression risk | Rollback | Priority |
|---|---|---|---|---|---|---|
| `usePermissions` (hook) | `role_permissions` table + `DEFAULT_PERMISSIONS` map, session-lifetime cache | Catalog-derived grants via `has_permission` RPC or cached `v_authz_effective_permissions`; cache-bust via `authz_current_state().fingerprint` | **M** | CRITICAL — every UI gate depends on it | simple (feature flag revert) | **P0** |
| `useUserRole` | `user_roles` direct read | Unchanged (role is legitimate primitive) — retained as convenience | S | LOW | trivial | P3 |
| `AuthorizationService` | Adapter over legacy map | Direct catalog-key evaluation from grant cache | S | LOW (parity-tested) | trivial | P0 (co-ships with `usePermissions`) |
| `<Can>` | `AuthorizationService.can(module.action)` → legacy | Same interface, catalog-backed | S | LOW | trivial | P0 (co-ships) |
| `<CanExport>` | Legacy `exportGuard` + role check | Catalog key `<module>.export` via service | S | MED — export is a compliance-sensitive gate | simple | P1 |
| `PermissionRoute` | Legacy `usePermissions` + hard-coded module/action | Catalog-key route guard | S | HIGH — bypassable at the route boundary | simple | P0 (co-ships) |
| Sidebar | Legacy hook for nav visibility | Grant cache | S | LOW (visibility only) | trivial | P1 |
| Mobile bottom nav | Same as Sidebar | Same | S | LOW | trivial | P1 |
| Feature guards inside pages (~40 files) | Ad-hoc `usePermissions()` + `isAdmin` + hard-coded role strings | Catalog keys via `<Can>` / `useAuthorization()` | **L** | HIGH — any missed site is an ambient bypass | moderate (per-file revert) | P1 |
| Route guards in `App.tsx` | Mixed: PermissionRoute + inline role checks | Uniform `<PermissionRoute permission="…"/>` | S | HIGH | simple | P0 (with PermissionRoute) |

### 1.2 Backend

| Consumer | Current source | Target source | Complexity | Regression risk | Rollback | Priority |
|---|---|---|---|---|---|---|
| `has_role(user_id, role)` | Live; called by 187 policies | **Retained** as primitive; called only inside `has_permission` internals or by policies that must decide purely on role | — | — | — | keep |
| `has_permission(user_id, permission)` | Live; called by 36 policies | Called by ~95% of policy-appropriate policies | **XL** | CRITICAL (policy-by-policy) | per-batch rollback per Wave 3a pattern | P0 (Wave B) |
| SECURITY DEFINER RPCs (101) | Mixed: some self-check `has_role`, some rely on RLS, some do neither | Uniform `has_permission` check + audit inside every definer RPC (S1 v1.1) | **L** | HIGH — primary privilege-escalation surface | moderate (per-RPC revert) | P0 |
| RPC Manifest coverage | 12 / 101 catalogued | 101 / 101 catalogued | M | MED | trivial (YAML) | P0 |
| Edge functions (7) | Bearer token + `service_role` client; per-function permission logic | Central helper: decode JWT → call `has_permission` before privileged action | M | HIGH — service_role bypasses RLS entirely | simple (per-function feature flag) | P1 |
| Triggers | Do not authorize (correct) | Unchanged | — | LOW | n/a | keep |

### 1.3 Database

| Consumer | Current source | Target source | Complexity | Regression risk | Rollback | Priority |
|---|---|---|---|---|---|---|
| RLS policies (370) | 187 `has_role` · 36 `has_permission` · ~147 direct predicates | 100% via `has_permission` where policy-appropriate; direct-predicate policies (auth.uid = user_id) retained | **XL** | CRITICAL | per-table rollback pattern (Wave 3a) | P0 (Wave B) |
| `v_authz_effective_permissions` | Exists, unread | Read by client grant cache | S | LOW | trivial | P0 (with `usePermissions`) |
| Permission Catalog (`authz_permissions`) | Seeded, unread by runtime | Read by every consumer above | S | LOW | trivial | P0 |
| Bundles (`authz_bundles*`) | Dormant | Historical only; removed in M6 | — | LOW | trivial | R8 |
| Role bindings (`authz_role_bundles`) | Dormant | Direct role→permission grants post-M6 | S | LOW | trivial | R8 |

---

## 2. Runtime Waves

Each wave is an **independent** unit: it can ship, be verified, and
rolled back without touching adjacent waves. Waves are numbered in
recommended execution order; dependencies are explicit.

### R1 · Runtime Consumer Foundation

- **Goal.** Wire the first runtime consumer to the new architecture without changing any authorization decision. Ship the grant-cache primitive and cache-bust wiring.
- **Deliverables.** (a) Client grant fetcher backed by `v_authz_effective_permissions`; (b) `usePermissions` polls `authz_current_state().fingerprint` and invalidates on change; (c) `AuthorizationService` still returns identical answers (parity-tested).
- **Dependencies.** BA-01, BA-02 (both landed).
- **Regression surface.** Every UI gate. Parity harness (`Can.parity.test.tsx`, `AuthorizationService.contract.test.ts`, `navigation.parity.test.ts`) must remain 100% green.
- **Rollback.** Feature flag `authz_v2_grant_cache` off → legacy path.
- **Golden Baseline impact.** None (no policy, no RPC, no catalog change).
- **Harness coverage.** Existing rbac.deep + parity suites cover; add one Playwright spec asserting fingerprint-driven refetch after a bump.
- **Decisions affected.** 0 semantic changes; 100% of client decisions rerouted through the new fetcher.

### R2 · Frontend Authorization

- **Goal.** Migrate every frontend gate (`<Can>`, `<CanExport>`, `PermissionRoute`, Sidebar, MobileNav, ~40 feature guards, route guards) to catalog keys sourced from the R1 cache. Retire `DEFAULT_PERMISSIONS` map and hard-coded role checks / `isAdmin` in JSX.
- **Deliverables.** Codemod-style sweep of `src/**` replacing `usePermissions()` legacy call shapes with `useAuthorization().authz.can('<module>.<action>')`; delete `DEFAULT_PERMISSIONS`.
- **Dependencies.** R1.
- **Regression surface.** Every page. All Playwright rbac specs.
- **Rollback.** Per-file revert; `DEFAULT_PERMISSIONS` retained one release cycle behind a flag.
- **Golden Baseline impact.** None.
- **Harness coverage.** rbac.spec + rbac.deep.spec.
- **Decisions affected.** ~100% of frontend gating (still same answers).

### R3 · RPC Manifest Coverage + SECURITY DEFINER Authorization

- **Goal.** Bring the 89 uncatalogued SECURITY DEFINER RPCs into `rpc_manifest.yaml` and make each one conform to S1 v1.1: uniform `has_permission(auth.uid(), <catalog key>)` check at the top of the body + audit log entry with `auth.uid()`.
- **Deliverables.** 89 manifest entries; per-RPC hotfix migrations following the H3-1 / H3-2 pattern.
- **Dependencies.** R1 (fingerprint-observability so bumps are visible client-side); RPC-08, RPC-09.
- **Regression surface.** Every existing caller of each definer RPC. Contract tests per RPC.
- **Rollback.** Per-RPC (SQL rollback file next to hotfix, mirroring `docs/security/H3_*_ROLLBACK.sql`).
- **Golden Baseline impact.** `golden_rpc_baseline.csv` diff per RPC; every change labeled in `intentional_changes.txt`.
- **Harness coverage.** RPC analyzer + manifest checker (RPC-09) strict from this wave onward.
- **Decisions affected.** 89 RPCs × 8 roles = **712 RPC authorization decisions** newly enforced by the catalog.

### R4 · Edge Function Authorization

- **Goal.** Introduce a shared edge helper that (a) decodes the caller JWT, (b) calls `has_permission(uid, key)` via the anon-key client, (c) refuses the request on false. Wrap all 7 edge functions.
- **Deliverables.** `supabase/functions/_shared/authz.ts` helper; per-function wrapping.
- **Dependencies.** R3 (permission keys the helper checks must exist and be enforced everywhere else).
- **Regression surface.** All edge function callers (reminders, admin ops, exports, queue alerts, winback).
- **Rollback.** Per-function revert (delete the helper call).
- **Golden Baseline impact.** None (edge functions are outside the RLS/RPC baseline; separate coverage doc).
- **Harness coverage.** Edge-function integration tests.
- **Decisions affected.** 7 functions × role set.

### R5 · RLS Cutover — `has_role` → `has_permission`

- **Goal.** Migrate 187 `has_role`-based policies to `has_permission(auth.uid(), '<key>')` where policy-appropriate, following the Wave 3a / 3b / 3c / 3d / 3e pattern batches. Policies that are legitimately role-based (e.g. admin-only maintenance) remain on `has_role`; the change must be justified in the batch design doc.
- **Deliverables.** Batched migrations; per-batch rollback SQL; per-batch diff report; `intentional_changes.txt` entries.
- **Dependencies.** R1 (client refetches on bump), R3 (RPC surface uniform), BA-01B (integrity CI gate).
- **Regression surface.** All 106 RLS-bearing tables. Golden Baseline diff on every batch. `rbac.deep.spec.ts` per role.
- **Rollback.** Per-batch SQL (established pattern).
- **Golden Baseline impact.** ~187 cells transition classification; each labeled.
- **Harness coverage.** `run_all.sh` gates every merge.
- **Decisions affected.** **187 policies × avg 8 roles ≈ 1,496 RLS decisions** re-anchored to the catalog. Largest single security dividend.

### R6 · Trigger Authorization Audit

- **Goal.** Confirm no trigger is silently performing authorization; add explicit `SET LOCAL role` or `has_permission` guards for the two triggers flagged by BA-01A follow-up (`authz_versions_immutability`, `authz_versions_no_delete` are internal, not user-facing — audit remains a formality here).
- **Deliverables.** Trigger audit report; migrations only if a trigger is found to authorize.
- **Dependencies.** none.
- **Regression surface.** narrow.
- **Rollback.** trivial.
- **Golden Baseline impact.** likely none.
- **Harness coverage.** static analysis of `pg_trigger`.
- **Decisions affected.** expected 0; verification only.

### R7 · Integrity CI Gate (BA-01B, promoted from infrastructure track)

- **Goal.** Ship `scripts/authz/check_integrity.py` and wire it into `run_all.sh`. Progressive strictness per BA-01A §5.5.
- **Deliverables.** Checker, tests, run_all wiring, CI docs update.
- **Dependencies.** R1 through R3 landed (so blocking rules don't false-positive on inflight migrations).
- **Regression surface.** CI only.
- **Rollback.** revert.
- **Golden Baseline impact.** none.
- **Harness coverage.** own unit tests.
- **Decisions affected.** meta.

### R8 · Legacy Removal

- **Goal.** Delete `role_permissions` table + `DEFAULT_PERMISSIONS` map + dormant `authz_bundles*` machinery + legacy `AuthorizationService` adapter path.
- **Deliverables.** Cleanup migrations, code deletions, doc archival per LIFECYCLE_POLICY.
- **Dependencies.** R2 fully soaked in production ≥ 1 sprint; R5 complete.
- **Regression surface.** none if soak clean.
- **Rollback.** `git revert`; data is a re-seed from the catalog (deterministic).
- **Golden Baseline impact.** removes bundle rows from the RLS inventory; labeled.
- **Harness coverage.** post-deletion zero-diff run.
- **Decisions affected.** hygiene.

---

## 3. Safest execution order (security-first, not effort-first)

```
    R1 ─► R2 ─► R3 ─► R4 ─► R5 ─► R6 ─► R7 ─► R8
    │                       │              │
    └── enables client       │              └── enforces everything above
        observability of     └── the bulk security win
        every subsequent     (RLS cutover)
        bump
```

Rationale for order:

- **R1 first** because no other wave is safely observable to running clients without it. Without cache-bust, R2/R3/R5 can leave sessions holding stale grants for hours.
- **R2 second** to eliminate the largest passive bypass surface (frontend legacy map) before touching any policy.
- **R3 before R5** because policy migrations depend on RPC permissions being catalog-anchored; otherwise a policy gated on `payments.write` may pass at the RLS boundary but a caller-side RPC still does no check.
- **R4 before R5** because edge functions use `service_role` and can bypass RLS entirely — their central check must be in place before the RLS cutover, or the "everything must go through the catalog" invariant is violated on service_role code paths.
- **R5 fifth** so the RLS cutover happens against a runtime that already speaks the catalog language everywhere else. Reduces blast radius per batch.
- **R6 and R7** are lightweight; they harden the invariants R1–R5 established.
- **R8 last** — never delete legacy while any migration route depends on it.

Order minimizes:
- Privilege escalation (R3, R4 close highest-risk surfaces before R5 exposes them).
- Authorization drift (R1 makes drift observable within seconds of a bump, from wave 1 onward).
- Rollback complexity (each wave has an isolated flag or per-batch revert).
- Production risk (R5, the largest change, is preceded by four smaller stabilizing waves).

---

## 4. Answers

**Q1. Highest security improvement for the least risk?**
**R1 — Runtime Consumer Foundation.** One feature-flagged fetcher change wires every frontend authorization decision to the new state model. No policy changes, no permission changes, no rollback beyond flipping a flag. Immediately makes every subsequent grant change observable within seconds. Highest leverage-per-risk of any wave.

**Q2. Which Runtime Wave becomes mandatory before any further infrastructure work?**
**R1.** Until at least one runtime consumer reads `authz_current_state()`, every new infrastructure feature (BA-03…) adds inert surface. R1 is the minimum bar to justify continuing infrastructure work.

**Q3. At what Runtime Migration percentage is it safe to resume BA-03?**
**≥ R1 shipped and stable in production for one deploy cycle (≈ 1 week).** Numerically: when at least **one consumer** reads the new architecture and cache-bust is verified end-to-end. That corresponds to roughly **10–15% runtime migration by weighted decision count**, but the meaningful threshold is qualitative (R1 done), not the percentage.

**Q4. Production-ready percentage?**
**R1 + R2 + R3 + R4 complete, with R7 CI gate active.** By decision count: ~50–55% of runtime authorization decisions catalog-anchored (all frontend gates, all edge functions, all RPCs, plus the 9.7% of RLS already migrated). R5 completion pushes this to ~95%+. R8 is hygiene; it does not affect production readiness.

The correct production-ready milestone is therefore **end of R4 with R7 active** — after which R5 is the ongoing bulk cutover, safely gated by the harness and cache-bust.

*End of strategy. No implementation performed.*
