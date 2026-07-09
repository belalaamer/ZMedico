# R5 Pre-Implementation Architecture Review

**Reviewer role:** Independent Principal Security Architect (external).
**Mode:** Documentation only. No code, SQL, RLS, bundle, permission, or migration touched.
**Basis:** All existing docs in `docs/`, `scripts/authz/`, and the runtime source under `src/lib/authz/`.
**Frames applied:** NIST SP 800-207 (Zero Trust), NIST RBAC (INCITS 359), NIST ABAC (SP 800-162), OWASP Authorization Cheat Sheet, HIPAA Security Rule §164.308/312, PCI-DSS v4 §7, large-scale SaaS authz patterns (Google Zanzibar, AWS IAM, Auth0 FGA).

> This review is deliberately harsh. Every "green" here is earned; every "red" is a blocker for the 500-clinic thought experiment at the end.

---

## Scoring rubric (used in §1 for all 30 areas)

- **Simplicity** — could a new engineer understand it in one week?
- **Maintainability** — can it change safely under CI without archaeology?
- **Security** — resists both external attack and insider mistake?
- **Enterprise readiness** — survives 500 tenants, HIPAA audit, penetration test?

All scores 0–100. `M` = mandatory-before-R5. `Rx` = defer to Wave x.

---

## 1. Area-by-area review

### 1. Permission Catalog
- **Current:** `authz_permissions` with `<group>.<verb>` (grandfathered) and new `<group>.<resource>.<verb>` (Standards §1). 151 keys planned in v2; ~135 Active.
- **Strengths:** Single source of truth, CI-enforced regex, closed verb set, taxonomy doc.
- **Weaknesses:** Two grammars coexist (2-seg vs 3-seg). No machine-readable JSON export. `deprecated` is a boolean, not a state field — Draft/Approved/Active/Deprecated/Retired lives in docs, not the DB.
- **Hidden debt:** Lifecycle state is *implied* from timestamps + docs; no `state` column.
- **Scalability risk:** At 500 clinics, adding a domain quarterly = 40+ new keys/quarter. Two grammars will fossilize.
- **Security risk:** Low.
- **Scores:** Simplicity 72 · Maintainability 78 · Security 88 · Enterprise 74.
- **Improvement:** Add `state app_perm_state` enum column; publish machine-readable export. **Wait R6.**

### 2. Bundle Architecture
- **Current:** `authz_bundles`, `authz_bundle_permissions`, `authz_bundle_implies` (max depth 2).
- **Strengths:** Roles never grant permissions directly; implies-graph is shallow.
- **Weaknesses:** No enforced size cap in DB (Standards says 40; nothing checks). No responsibility metadata column. Bundle names still overlap role names in a few historical rows.
- **Hidden debt:** No cycle-detector trigger; guardrail is script-side only.
- **Scalability risk:** Bundle drift the moment domain owners can create bundles freely.
- **Security risk:** Medium — a mis-authored bundle silently over-grants everyone bound to it.
- **Scores:** Simplicity 70 · Maintainability 74 · Security 80 · Enterprise 72.
- **Improvement:** DB trigger for cycle + size cap; `responsibility` NOT NULL text column; rename role-shaped bundles. **Trigger + rename mandatory before R5** (M). Metadata column R6.

### 3. Role Architecture
- **Current:** `app_role` enum, `user_roles` table, `has_role()` security-definer, role→bundle binding.
- **Strengths:** Roles are pure identity labels; no roles on `profiles`; canonical `has_role` avoids recursion.
- **Weaknesses:** Enum growth is a migration each time (rigid but auditable — acceptable tradeoff). No role owner metadata. Class D compatibility utilities still call `has_role` — acceptable but must stay small.
- **Hidden debt:** No test that every enum value maps to ≥1 bundle.
- **Security risk:** Low.
- **Scores:** Simplicity 82 · Maintainability 80 · Security 90 · Enterprise 78.
- **Improvement:** CI assertion "every app_role has ≥1 bundle". **Wait R6.**

### 4. Scope Model (branch)
- **Current:** RESTRICTIVE branch predicate per table, `user_branches(uid)` helper.
- **Strengths:** RESTRICTIVE isolation is cross-cutting; can't be over-ridden by a permissive policy mistake.
- **Weaknesses:** Scope is not a first-class primitive. `branch_id` is duplicated on ~40 tables with no shared FK contract. No "global" scope marker (some tables want tenant-level, not branch).
- **Hidden debt:** Multi-branch users rely on `ANY(user_branches(...))` — helper is STABLE but re-evaluated per row on some Postgres plans.
- **Scalability risk:** **High** at 500 clinics. Branch matrix will explode.
- **Security risk:** Medium — one missing `branch_id NOT NULL` = data leak.
- **Scores:** Simplicity 60 · Maintainability 58 · Security 76 · Enterprise 55.
- **Improvement:** Introduce a `scope_context` view/function returning `(tenant_id, branch_id, org_id)`; standardise `branch_id UUID NOT NULL REFERENCES branches` contract. **Contract check mandatory before R5** (M). Full scope primitive R6/R7.

### 5. Ownership Model
- **Current:** Ad-hoc columns (`assigned_doctor_id`, `owner_id`, `created_by`, `patient_id → assigned_to`). No unified helper.
- **Strengths:** Present where clinical data lives.
- **Weaknesses:** No `owns(uid, table, row_id)` function; each policy re-implements its own ownership predicate.
- **Hidden debt:** Renaming an ownership column = grep across ~40 policies.
- **Scalability risk:** High.
- **Security risk:** Medium.
- **Scores:** Simplicity 45 · Maintainability 40 · Security 70 · Enterprise 50.
- **Improvement:** First-class `authz_ownership(actor, table, row)` STABLE helper per domain. **Not blocking R5** — B6/B7 can absorb the current shape — but R6 must land it.

### 6. Authorization Pipeline
- **Current:** Documented (Standards §5): AuthN → Perm → Scope → Ownership → Business → State → Approval → RLS → Audit.
- **Strengths:** Explicit, ordered, testable.
- **Weaknesses:** Nine stages, but only three (Perm, Scope, RLS) are enforced by machinery. Business/Approval/Audit rely on developer discipline.
- **Scalability risk:** Medium.
- **Security risk:** Medium — silent skipping of Approval or Audit is not detectable today.
- **Scores:** Simplicity 65 · Maintainability 62 · Security 72 · Enterprise 66.
- **Improvement:** CI linter for policies that mutate money/clinical rows without an `audit_logs` INSERT trigger. **Wait R6.**

### 7. `has_permission()`
- **Current:** SECURITY DEFINER, STABLE, no client actor, joins `user_roles → authz_role_bundles → authz_bundle_permissions (+ implies)`.
- **Strengths:** Correct definer pattern, `auth.uid()` only, ~0.2–0.4 ms.
- **Weaknesses:** No per-decision cache in a single statement (Postgres will call it once per row unless folded). No feature flag to short-circuit for load tests.
- **Scores:** Simplicity 88 · Maintainability 85 · Security 92 · Enterprise 82.
- **Improvement:** Wrap heavy queries with `WHERE has_permission(...)` folded to a session-cached CTE; benchmark 100 k row scans. **Wait R6.**

### 8. AuthorizationService (frontend)
- **Current:** Single class, telemetry, feature-flag, admin-override method, role adapters (transitional).
- **Strengths:** Every gate flows through it. Adapters clearly labelled transitional.
- **Weaknesses:** `hasRole` / `hasRoleAny` / `holdsAnyRole` / `isSuperAdmin` are four escape hatches — even with warnings, four is three too many.
- **Scores:** Simplicity 78 · Maintainability 76 · Security 82 · Enterprise 78.
- **Improvement:** Collapse to a single `identity()` accessor returning `{ isSuperAdmin, roles }`; deprecate the four adapters on the same schedule. **Wait R8.**

### 9. RLS Architecture
- **Current:** Mix of P1–P12 patterns. 66/424 migrated. RESTRICTIVE tenant/branch isolation everywhere on public.
- **Strengths:** RESTRICTIVE separation is textbook; permissive policies encode intent per-verb.
- **Weaknesses:** State + AUTHZ still mixed in ~47 policies (B8 target). Some tables carry 9–10 policies — hard to audit at a glance.
- **Scores:** Simplicity 55 · Maintainability 60 · Security 78 · Enterprise 62.
- **Improvement:** R5 itself; plus post-R5 policy consolidation pass. **Delivered by R5.**

### 10. SECURITY DEFINER Architecture
- **Current:** 91 functions inventoried, 8 client-callable, all migrated to `has_permission`. `search_path` locked per S1.
- **Strengths:** Small client surface, full inventory, S1 standard exists.
- **Weaknesses:** 83 utility functions are trusted by convention; no periodic re-audit cadence.
- **Scores:** Simplicity 75 · Maintainability 78 · Security 84 · Enterprise 80.
- **Improvement:** Quarterly automated definer diff. **Wait R6.**

### 11. RPC Authorization
- **Current:** `rpc_manifest.yaml` classifies A/B/C/D/E; guardrails block undocumented client RPCs.
- **Strengths:** Manifest is the contract; CI blocks drift.
- **Weaknesses:** Manifest is YAML in-repo — a moderately trusted attacker with commit access can reclassify a Class D as Class E to hide it.
- **Scores:** Simplicity 80 · Maintainability 82 · Security 78 · Enterprise 75.
- **Improvement:** Require two reviewers on any manifest change; sign manifest with a build-time hash. **Wait R6.**

### 12. Branch Isolation
- **Current:** RESTRICTIVE predicate + helper.
- **Strengths:** Cross-cutting, hard to bypass.
- **Weaknesses:** Predicate text is duplicated across policies — refactor risk.
- **Scores:** Simplicity 62 · Maintainability 55 · Security 82 · Enterprise 60.
- **Improvement:** Extract to a shared policy template macro (see §4). **Wait R6.**

### 13. Tenant Isolation
- **Current:** `tenant_id` on top-level rows, cascaded via FK.
- **Strengths:** Present.
- **Weaknesses:** **Not every public table carries `tenant_id` directly** — some rely on parent join to derive it. That means a bug in the parent policy leaks children.
- **Scalability risk:** **High** — this is the #1 concern for multi-org.
- **Security risk:** **High**.
- **Scores:** Simplicity 55 · Maintainability 50 · Security 65 · Enterprise 45.
- **Improvement:** Denormalise `tenant_id` onto every row with a trigger-enforced invariant. **Mandatory audit before R5** (M — read-only audit; denormalisation can wait to R6).

### 14. Future multi-clinic scaling
- **Current:** Clinic ≈ tenant today.
- **Weakness:** No `clinic_group_id` / `organization_id` above tenant.
- **Enterprise 40.**
- **Improvement:** Introduce `organizations` in R7 before onboarding chains. **R7.**

### 15. Future multi-organization scaling
- **Current:** None.
- **Enterprise 30.**
- **Improvement:** Zanzibar-style relation tuples for cross-org sharing (referrals, consult). **R8.**

### 16. Future SaaS licensing
- **Current:** `subscriptions`, `subscription_plans`, `subscription_addons` exist; no runtime enforcement of feature entitlements.
- **Weakness:** Permissions ≠ entitlements. Today, granting `payroll.run.run` does not check whether the tenant's plan includes payroll.
- **Enterprise 40.**
- **Improvement:** Add `entitlement(tenant_id, feature)` layer *above* `has_permission`. Pipeline becomes: Entitlement → Permission → …. **R7.**

### 17. Future external API access
- **Current:** None.
- **Weakness:** No API keys, no scopes, no per-integration rate-limits. Bare Supabase anon key would leak everything.
- **Enterprise 25.**
- **Improvement:** OAuth2 client-credentials + scoped bundles + per-key `has_permission`. **R8+.**

### 18. Future mobile applications
- **Current:** SPA only.
- **Weakness:** Same session model; no device-bound tokens; no offline scope negotiation.
- **Enterprise 45.**
- **Improvement:** Refresh-token rotation with device fingerprint; scope negotiation on token exchange. **R8.**

### 19. Offline synchronization
- **Current:** None.
- **Weakness:** Authorization is server-authoritative and synchronous. No signed capability tokens for offline writes.
- **Enterprise 20.**
- **Improvement:** Capability-based tokens with server-side reconciliation (defer entirely to a dedicated program). **R9+.**

### 20. Event-driven authorization
- **Current:** None. All decisions are pull.
- **Weakness:** No revocation propagation; a compromised role change waits for next `has_permission` call.
- **Enterprise 55.**
- **Improvement:** `authz_version` fingerprint already exists (BA-02); build a pub/sub invalidator. **R6.**

### 21. Audit Model
- **Current:** `audit_logs` and `user_activity_logs` tables; ad-hoc INSERTs.
- **Weakness:** No CI check that money/clinical mutations write an audit row. HIPAA §164.312(b) demands audit — coverage is not proven.
- **Enterprise 55.**
- **Improvement:** DB triggers that FAIL the transaction if an audit row is missing for high-risk tables. **Mandatory before R5 for the 5 highest-risk tables** (M): `invoices`, `payments`, `prescriptions`, `medical_records`, `payroll`.

### 22. Break-glass Model
- **Current:** None.
- **Weakness:** No documented emergency access with time-bounded elevation, notification, and mandatory review. HIPAA §164.312(a)(2)(ii) explicitly calls for this.
- **Enterprise 30.**
- **Improvement:** `break_glass` permission + time-boxed grant + auto-notification + mandatory post-incident review. **R6 — non-blocker for R5 but required before HIPAA audit.**

### 23. Approval Workflow
- **Current:** Ad-hoc — `expenses.approve`, `purchase_orders.approve`, etc. No shared framework.
- **Weakness:** Every domain re-implements four-eyes.
- **Enterprise 55.**
- **Improvement:** Shared `approval_requests` table + state machine + policy template. **R6.**

### 24. Compliance Model
- **Current:** S1/S2 standards exist; C4/C5 changes require DPO.
- **Strength:** Documented.
- **Weakness:** No mapped control matrix (HIPAA control → policy/CI check).
- **Enterprise 60.**
- **Improvement:** HIPAA + PCI control-mapping matrix. **R6.**

### 25. Version Registry (BA-01/02)
- **Current:** `authz_versions` fingerprint + client subscription.
- **Strength:** Enables cache invalidation and drift detection.
- **Weakness:** Not exposed in guardrails; drift alerts are manual.
- **Enterprise 65.**
- **Improvement:** Automate drift alert to Slack/PagerDuty. **R6.**

### 26. Runtime Architecture
- **Current:** R1–R4 complete; single client, single service, telemetry, feature flag.
- **Strength:** Cohesive.
- **Weakness:** Telemetry is fire-and-forget; no aggregation dashboard yet.
- **Enterprise 72.**
- **Improvement:** Push telemetry to analytics table with retention. **R6.**

### 27. Migration Strategy
- **Current:** R5 execution plan; two-phase recipe; Golden Baseline.
- **Strength:** Rigorous.
- **Weakness:** No canary tenant. Everyone gets each phase at once.
- **Enterprise 60.**
- **Improvement:** Canary-tenant flag on RLS predicates using `tenant_id IN canary_set`. **Wait R6 — not blocking R5 because Golden Baseline + soak substitute.**

### 28. CI Validation
- **Current:** `run_all.sh`, 20 blockers documented, `GUARDRAILS_STRICT=1`.
- **Strength:** Comprehensive rules.
- **Weakness:** Bash orchestrator; no per-check timing budget; failure output is grep-hostile.
- **Enterprise 70.**
- **Improvement:** JSON output + timing per check. **R6.**

### 29. Rollback Strategy
- **Current:** Per-batch SQL files; independent scripts.
- **Strength:** Textbook.
- **Weakness:** No automated post-rollback verification script — a human still has to eyeball the diff.
- **Enterprise 68.**
- **Improvement:** `verify_rollback.py` re-runs the baseline. **Mandatory before B8** (M).

### 30. Disaster Recovery
- **Current:** Supabase PITR; no documented RTO/RPO for authz specifically.
- **Weakness:** No published DR runbook for "authz tables corrupted".
- **Enterprise 40.**
- **Improvement:** DR runbook + tabletop exercise. **R6.**

---

## 2. Aggregate Scores

- **A) Final Architecture Score:** **78 / 100**
- **B) Production Readiness Score:** **74 / 100**
- **C) Enterprise Readiness Score:** **62 / 100**
- **D) Technical Debt Score:** **32 / 100** *(lower = less debt)*

### E) Risk Matrix

| Risk | Likelihood | Impact | Severity |
|---|---|---|---|
| Tenant isolation via join, not column | Medium | Critical | **High** |
| Missing audit for money/clinical mutations | High | Critical | **High** |
| No break-glass model (HIPAA gap) | High | High | **High** |
| Ownership predicates duplicated | High | Medium | Medium |
| Bundle drift without DB triggers | Medium | High | Medium |
| No entitlement layer (plan mismatch) | Medium | Medium | Medium |
| Scope model coupled to branch column | High | Medium | Medium |
| Manifest tamper via commit | Low | High | Medium |
| Telemetry not aggregated | High | Low | Low |
| No canary tenant | Medium | Medium | Medium |

### F) Go / No-Go recommendation

**Conditional GO for R5**, contingent on the following mandatory items landing **before B1 merges**:

1. **Tenant-isolation audit** — enumerate every public table, mark whether `tenant_id` is direct or derived, publish `docs/execution/runtime/R5/TENANT_ISOLATION_AUDIT.md`. (Read-only, no schema change yet.)
2. **Audit-INSERT trigger for the 5 top-risk tables** — `invoices`, `payments`, `prescriptions`, `medical_records`, `payroll`.
3. **Bundle DB trigger** — cycle-detector + size cap (≤40).
4. **Rename any role-shaped bundle** — one migration, before B2.
5. **`verify_rollback.py`** — automated post-rollback baseline verifier, required before B8.

Break-glass, entitlement layer, ownership helper, canary tenant, telemetry aggregation, DR runbook are **not R5 blockers** — they are R6/R7/R8.

---

## 3. Ten answers, brutally

1. **If you were the CTO of a company deploying this to 500 clinics, would you approve R5?**
   *Yes, conditionally.* The runtime is genuinely solid; R5 finishes the RLS story. But I would not sign off on the 500-clinic rollout until the five M-items above are done and the six R6 items (entitlement layer, break-glass, ownership helper, canary tenant, audit-trigger sweep beyond top-5, DR runbook) are complete. R5 is the RLS wave, not the multi-tenant scale wave.

2. **If not, what exactly must change first?**
   The five mandatory items in §F. Nothing else blocks R5 itself.

3. **What is the single biggest architectural weakness remaining?**
   Tenant isolation is enforced by join-chains, not by a denormalised `tenant_id` column with a trigger-enforced invariant. One buggy parent policy leaks children. This is the *only* place where the architecture is one bug away from a cross-tenant breach.

4. **What is the single biggest security risk remaining?**
   No break-glass model. In an emergency (unconscious patient, ransomware, insider incident), staff will either be blocked or an engineer will hand-edit `user_roles` in prod — both are worse than a controlled, audited break-glass. This is also a HIPAA finding waiting to happen.

5. **What would you redesign if starting from scratch today?**
   Zanzibar-style relation tuples (`user → relation → object`) instead of role→bundle→permission→RLS. It collapses roles, bundles, ownership, scope, and cross-tenant sharing into one primitive and one API. The current model works, but you're re-inventing FGA one table at a time. Do *not* redesign now — capture as an R10 program.

6. **What parts of the architecture are already production-grade?**
   `has_permission()`, the AuthorizationService single entry point, the R3 RPC classification + manifest, the Golden Baseline + regression harness, the Standards constitution, the R5 execution plan.

7. **What should never be changed again?**
   The canonical decision pipeline (Standards §5), the AUTHZ ∧ STATE split rule (Standards §6), the Registry → Bundle → Role → Consumer flow (Standards §7), and the single `has_permission(auth.uid(), key)` entry point.

8. **What documentation can now be archived?**
   Wave 1 foundation docs (`WAVE1_AUTHZ_FOUNDATION.md`), Sprint 1 declarative wrappers (`SPRINT1_BATCH2A_*`), RC1 adversarial reviews, N7/N8 design reviews, `A0/A1/A2/A3` simplification papers, all `_5` interim readiness certifications after R5 lands. Move to `docs/_archive/` with a manifest.

9. **Which documents remain authoritative?**
   `AUTHORIZATION_STANDARDS.md`, `governance/CHARTER.md`, `governance/LIFECYCLE_POLICY.md`, `governance/OWNERSHIP_MATRIX.md`, `governance/PRODUCT_DECISIONS.md`, `normalization/N1_PERMISSION_TAXONOMY_V2.md`, `RBAC_MATRIX.md`, `BUSINESS_OPERATIONS_CATALOG.md`, `scripts/authz/rpc_manifest.yaml`, `scripts/authz/intentional_changes.txt`, `R5_EXECUTION_PLAN.md`.

10. **What should become immutable after R5?**
    - The Standards constitution.
    - The canonical decision pipeline.
    - The AUTHZ ∧ STATE split rule.
    - The Registry → Bundle → Role → Consumer flow.
    - The R5 batch ordering (once executed, historical record).
    - The Golden Baseline snapshot tag at R5 completion (as `AUTHZ_V2_RTM`).
    - The `has_permission()` signature and semantics.
    - The RPC classification schema (A/B/C/D/E).

---

*This concludes the independent pre-R5 architecture validation. Verdict: **Conditional GO** — proceed with R5 only after the five mandatory items in §F land. Defer everything else to R6+ per the improvement tags in §1.*
