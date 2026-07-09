# R4.5 — Authorization Runtime Readiness Certification

**Status:** Certification review · **Scope:** Verification-only · **Behavior change:** None.

Final runtime readiness gate before R5 (large-scale RLS migration). Certifies that the frontend, backend, database, and infrastructure layers assembled across R1–R4 are sufficient to safely migrate production RLS policies.

---

## 1. Authorization Runtime Maturity Score

Each layer scored 0–100 against its ideal end-state. Weights reflect blast radius on R5.

### 1.1 Frontend (weighted 20%)

| Component | Score | Notes |
| --- | --- | --- |
| AuthorizationService | 95 | Single canonical entry point; contract tests + roles parity tests pass. −5 for transitional `hasRole*` adapters (removed in R8). |
| Adapter Layer (`useAuthorization`) | 95 | 48 call sites migrated (R2). Zero direct `roles.includes` / `isAdmin` in feature code. |
| Feature Flags (`featureFlags.ts`) | 90 | Flip-safe, per-decision. No stale flag debt. −10 for no admin UI to toggle at runtime. |
| Telemetry (`telemetry.ts`) | 85 | Decision + refresh telemetry captured; no aggregated dashboard yet. |
| Runtime State (`authzStateClient` / `useAuthzState`) | 95 | Fingerprint-driven refresh; verified in `authzState.test.ts`. |
| Cache Invalidation | 90 | Version-registry fingerprint triggers refresh; verified byte-identical. −10 for missing multi-tab broadcast (BroadcastChannel). |
| **Layer score** | **92** |  |

### 1.2 Backend (weighted 25%)

| Component | Score | Notes |
| --- | --- | --- |
| `has_permission()` | 100 | Canonical; sole allowed authorization primitive. |
| SECURITY DEFINER functions | 100 | R4: 8/8 client-callable guard-carrying RPCs migrated. Zero `_by`/`_actor` trust. |
| RPC authorization | 100 | 100% coverage, R3-inventoried. |
| RPC Manifest | 85 | Phase A schema check active; Phase B runtime drift check is advisory (`MANIFEST_STRICT=0`). Blocks promotion path to M4. |
| Guardrails (backend) | 90 | New-migration scanning past R3.5 cutoff; strict mode gated by `GUARDRAILS_STRICT=1`. Legacy skip marker documented. |
| **Layer score** | **95** |  |

### 1.3 Database (weighted 25%)

| Component | Score | Notes |
| --- | --- | --- |
| Permission Catalog | 95 | 6 keys added in R3, all mapped; N7 review clean. −5 for pending N4 dead-permission sweep (advisory only). |
| Bundle Graph | 95 | N2 integrity pass; N5 dependency graph acyclic. |
| Effective Permissions | 95 | Recursive CTE stable; N8 bundle-simulation matches Golden Baseline. |
| Authorization Version Registry (BA-01) | 95 | Version integrity framework live; registry entries exist for every wave. |
| Authorization State Model (BA-02) | 90 | State transitions verified. −10 for BA-03 (Change Ledger) not yet implemented — acceptable because R5 does not require it. |
| **Layer score** | **94** |  |

### 1.4 Infrastructure (weighted 30%)

| Component | Score | Notes |
| --- | --- | --- |
| Golden Baseline | 95 | Frozen; diff harness discriminates intentional vs. drift. |
| Regression Harness (`run_all.sh`) | 95 | RLS + RPC analyzers + diff + guardrails + manifest + compliance chained. |
| Guardrails (frontend + backend) | 90 | Advisory-by-default with strict-mode toggle; unit-tested. |
| Governance (charter + ownership + lifecycle) | 95 | Docs current through Sprint S2. |
| Version Registry (BA-01A framework) | 95 | Rollback SQL exists per version. |
| Compliance (S1/S2 SECURITY DEFINER standard) | 90 | Advisory in CI; strict-mode toggle wired. |
| **Layer score** | **93** |  |

### 1.5 Weighted Runtime Maturity

`0.20·92 + 0.25·95 + 0.25·94 + 0.30·93 = **93.6 / 100**`

---

## 2. Single Source of Truth Report

Every remaining place capable of making an authorization decision:

### 2.1 Canonical (green — the SoT)

| Location | Layer | Role |
| --- | --- | --- |
| `src/lib/authz/AuthorizationService.ts` | Frontend | Sole decision entry point |
| `src/lib/authz/useAuthorization.ts` | Frontend | React binding over the service |
| `public.has_permission(uuid, text)` | Backend | Sole runtime backend gate |
| 8 client-callable SECURITY DEFINER RPCs (R4 inventory §2.A) | Backend | Each calls `has_permission(auth.uid(), key)` exactly once |
| RLS policies referencing `has_permission(...)` | Database | Post-R5 target; growing coverage |
| Permission Catalog + Bundle Graph + Role Bundles | Database | Data behind `has_permission` |

### 2.2 Compatibility (yellow — allowed transitional surface)

| Location | Purpose | Sunset |
| --- | --- | --- |
| `AuthorizationService.hasRole/hasRoleAny/holdsAnyRole` | R2 transitional shims for identity-based decisions (branding, badges) | R8 removal |
| `has_role(uuid, app_role)` | Authorization primitive; used only inside `has_permission` derivation and by RLS pre-R5 | Retained; excluded from "0 has_role" rule per R3 Class D |
| `has_permission`, `is_tenant_owner` | Authorization primitives (cannot self-reference) | Retained permanently |
| RPC signatures still accepting `_by uuid` (`add_treasury_tx`, `apply_inventory_tx`, `receive_po_item`) | Source-compat only; parameter ignored for authorization and audit | Removed in R6 (RPC signature clean-up) |
| `handle_new_user`, audit v2 fns, number generators | Utilities; no decision surface | Retained |
| Edge Functions using service role (`admin-create-user`, `admin-delete-user`, `admin-reset-password`, `admin-export`) | Guarded by `has_role('admin')` post-JWT-verify — allowlisted in R3.5 guardrails | Retained; admin-role check is the intended boundary |
| Cron edge functions (`detect-queue-alerts`, `enqueue-winback`, `send-reminder`) | Service-role, no user identity | Retained |

### 2.3 Technical Debt (red — must decommission)

| Location | Type | Priority | Blocks R5? |
| --- | --- | --- | --- |
| RLS policies still gated on `has_role(...)` directly | Legacy pattern — the target of R5 | High | R5 is the fix |
| `role_permissions` table + editor (`src/pages/settings/RolePermissions.tsx`) | Legacy per-role permission override; superseded by Bundle Graph but still readable/writable | Medium | No — R7 |
| Sprint S2 compliance FAIL verdicts (advisory) | SECURITY DEFINER standard v1 conformance gaps in Class D/E fns | Low | No — advisory |
| Missing BroadcastChannel for cross-tab authz refresh | Frontend UX debt | Low | No |

**No red-item blocks R5.**

---

## 3. RLS Readiness

Is the current runtime architecture sufficient to safely migrate all remaining RLS policies to `has_permission(auth.uid(), '<key>')`?

| Requirement | Present? |
| --- | --- |
| Canonical backend gate (`has_permission`) | ✅ |
| Full permission catalog covering the Golden Baseline | ✅ (N3 coverage matrix + N6 completeness = 100%) |
| Bundle graph resolving every existing role → permission the RLS depends on | ✅ (N8 simulation) |
| Frozen Golden Baseline capable of catching drift on every RLS change | ✅ (`diff_baseline.py` exit-2 on unlabeled changes) |
| Per-table regression coverage (`analyze_rls.py --table X`) | ✅ |
| Rollback template (Wave 3 pilot + Wave 3a/3b/3c/3d/3e patterns) | ✅ |
| Guardrails preventing regression of already-migrated policies | ✅ (backend guardrails; strict-mode toggle) |
| Authorization Version Registry to stamp each RLS batch | ✅ (BA-01) |
| Authorization State model to expose fingerprint for cache refresh | ✅ (BA-02) |

**Verdict: RLS-ready.** The R5 migration can proceed batch-by-batch using the Wave 3e pattern catalog (P1–P5).

---

## 4. Migration Risk Matrix

Risk assessed for each RLS migration pattern that R5 will exercise. Scale: Low / Medium / High / Extreme.

| Pattern | Example tables | Risk | Rationale | Mitigation |
| --- | --- | --- | --- | --- |
| **Pattern migrations** (like-for-like `has_role` → `has_permission` on flat tables) | `medical_specialties`, `diagnoses`, `medications`, `service_categories`, `communication_templates` | **Low** | Bundle graph proven byte-identical (N8). Golden Baseline diff catches drift. | Wave 3e batching; per-table rollback. |
| **Ownership migrations** (self-vs-others gate) | `leave_requests`, `performance_reviews`, `attendance`, `staff_profiles` | **Medium** | `auth.uid() = user_id` half is unchanged; only the "manager override" half migrates. Existing self-guard triggers already enforce narrow write scope. | Two-phase: (a) add `has_permission` OR-branch alongside `has_role`, (b) remove `has_role` after 24 h clean telemetry. |
| **Branch-scope migrations** (row visibility via branch membership) | `patients`, `appointments`, `invoices`, `payments`, `expenses`, `treasury*`, `physio_*`, `medical_records` | **Medium-High** | Compounds `has_permission` with `user_has_branch_access(...)`. Branch helper set is Class D primitive — unchanged. Risk is composition, not primitives. | Migrate one branch-scoped table per PR; run branch-scoped RBAC Playwright suite (`tests/playwright/rbac.deep.spec.ts`) per batch. |
| **Compound-role migrations** (multi-role OR gates, e.g. `admin ∨ accountant ∨ manager`) | `invoices` (financial ops), `payments`, `doctor_commissions`, `payroll`, `saas_invoices` | **Medium** | Each role → bundle grants for the target permission key already exist (R3 model). Semantic equivalence provable via Golden Baseline. | Encode the OR set as a single new fine-grained permission key when the union isn't reused; otherwise reuse an existing bundle. |
| **State-machine policies** (row edits gated on status column) | `invoices.status`, `appointments.status`, `purchase_orders.status`, `treatment_plans.status`, `physio_cases.status` | **High** | Policies mix authorization with business-state predicates. Refactor risk = introducing "who can edit" regression while re-expressing "when it can be edited". | (1) Split each policy into `AUTHZ ∧ STATE` clauses in the same migration. (2) Keep STATE clause bit-identical. (3) Only AUTHZ side changes — Golden Baseline diff must show STATE-clause SQL unchanged. |

No pattern rises to Extreme. Highest concentration of risk is state-machine policies (~10 tables); dedicate the last R5 batch to them once P1–P4 clear.

---

## 5. Rollback Readiness

| Wave | Rollback artifact | Verified |
| --- | --- | --- |
| R1 — Runtime Consumer Foundation | `docs/execution/runtime/R1/R1_ROLLBACK.md` | ✅ |
| R2 — Frontend Adapter Migration | `docs/execution/runtime/R2/R2_ROLLBACK.md` | ✅ |
| R3 — RPC Authorization Unification | `docs/execution/runtime/R3/R3_ROLLBACK.sql` | ✅ |
| R3.5 — Enforcement Guardrails | `docs/execution/runtime/R3_5/R3_5_ROLLBACK.md` | ✅ |
| R4 — SECURITY DEFINER Runtime Migration | `docs/execution/runtime/R4/R4_ROLLBACK.md` (delegates to R3 + H3-1 + H3-2) | ✅ |
| H3-1 / H3-2 hotfixes | `docs/security/H3_1_MERGE_STAFF_POSITION_ROLLBACK.sql`, `docs/security/H3_2_APPLY_WALLET_TX_ROLLBACK.sql` | ✅ |
| BA-01 / BA-02 registries | `docs/execution/BA01/BA01_ROLLBACK.sql`, `docs/execution/BA02/BA02_ROLLBACK.sql` | ✅ |
| Wave 3 pilot RLS | `docs/wave3/PILOT_RLS_ROLLBACK.sql` + Wave 3a/3e per-batch rollback SQL | ✅ |

**Every completed Runtime Wave has a rollback.** No gaps.

---

## 6. CI Readiness

Detecting authorization drift during R5:

| Signal | Tool | Detects |
| --- | --- | --- |
| RLS drift | `scripts/authz/analyze_rls.py` + `diff_baseline.py` | Any `(role, action) → allow/deny` tuple change vs. Golden Baseline. Exit 2 unless labeled in `intentional_changes.txt`. |
| RPC drift | `analyze_rpcs.py` + baseline | Signature / permission-key regressions on SECURITY DEFINER RPCs. |
| Frontend regression | `guardrails_frontend.py` | New `has_role`, `roles.includes`, `isAdmin` outside compatibility surface. Strict-mode blocks CI. |
| Backend regression | `guardrails_backend.py --since <R3.5 cutoff>` | New SECURITY DEFINER without `has_permission`, missing `SET search_path`, actor param abuse. |
| Manifest drift | `check_rpc_manifest.py` | RPC ↔ permission-key contract mismatch. |
| SECURITY DEFINER standard | `compliance_definer.py` | S1-v1 conformance (advisory). |
| Runtime authorization contract | `src/lib/authz/*.test.ts` + `scripts/authz/tests/*` | Byte-identical decisions; parity tests. |

**R5-specific CI requirements met.** Recommendation: promote `GUARDRAILS_STRICT=1` for the duration of R5 to make guardrails blocking; keep `MANIFEST_STRICT=0` until M4.

---

## 7. Final Certification

**READY WITH CONDITIONS**

Conditions (all pre-R5, non-blocking on start; must be true before first R5 batch merges):

1. **Enable strict guardrails for R5.** Export `GUARDRAILS_STRICT=1` in the CI job that runs `scripts/authz/run_all.sh` for the duration of the R5 milestone. (No code change required.)
2. **Freeze the Golden Baseline snapshot at HEAD.** Regenerate `/mnt/documents/golden_authorization_baseline.csv` from the current DB and tag the commit — every R5 diff must be against this frozen point.
3. **Add `intentional_changes.txt` labeling protocol to R5 PR template.** Each RLS-touching PR must either (a) show zero diff or (b) list the tuple deltas with rationale.
4. **Adopt the two-phase migration recipe** documented in §4 for Ownership, Branch-scope, and Compound-role patterns (add `has_permission` OR-branch → soak 24 h → drop `has_role`).
5. **Reserve the final R5 batch for state-machine policies** and split each policy into `AUTHZ ∧ STATE` clauses to keep the STATE half byte-identical.

Non-blocking follow-ups (can land in parallel with R5): BroadcastChannel for cross-tab refresh, BA-03 Change Ledger, `role_permissions` legacy table decommission (R7), S2 compliance FAIL sweep for Class D/E utilities.

---

## Deliverables Index

- **Runtime Readiness Report:** this document
- **Runtime Maturity Dashboard:** §1 (per-layer + weighted 93.6/100)
- **Risk Matrix:** §4
- **Certification:** §7 — READY WITH CONDITIONS
