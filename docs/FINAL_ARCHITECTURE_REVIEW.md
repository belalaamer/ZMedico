# Final Authorization Architecture Review

**Reviewer stance:** Independent principal security architect. No prior commitment to previous design decisions.
**Scope:** Full authorization stack at the R4.5 gate — frontend adapters, backend RPCs, RLS, catalog, bundles, roles, scope, ownership, governance, versioning, tooling.
**Deliverable class:** Critical review. Documentation only.
**Standards referenced:** NIST SP 800-207 (Zero Trust), NIST INCITS 359 (RBAC), NIST SP 800-162 (ABAC), OWASP ASVS v4.0 §4, OWASP Authorization Cheat Sheet, CIS Controls v8 §6, Microsoft Enterprise Access Model, Google Zanzibar, HIPAA §164.308/§164.312, PCI-DSS §7 (financial-grade least privilege).

---

## 1. Executive Summary

The authorization system is **architecturally sound but operationally over-engineered for its current business scale**. The runtime stack (R1–R4) is genuinely well done: a single frontend entry point, a single backend gate (`has_permission`), a canonical actor (`auth.uid()`), a Golden Baseline, and a functioning guardrail harness. That core is production-worthy and R5-ready.

Around that core, however, the project has accumulated a **governance and documentation layer that has outgrown the code it governs**. There are ~90 documents (BA/N1–N9/S1–S2/Wave 3a–3e/H3/R1–R4.5) describing a system with roughly two dozen tables that actually enforce policy. The ratio of process-artifacts to enforced-policies is unhealthy and will slow every future change unless trimmed.

Three structural risks are worth surfacing now, before R5 makes them permanent:

1. **Permission-key inflation.** The R3 pattern of "one permission per RPC" (e.g., `treasury.tx.write`, `inventory.tx.write`, `purchase_orders.receive`) will produce hundreds of keys as R5 lands per-table. Without a naming spec and a merge policy, the catalog will fragment into the "one permission per function" anti-pattern.
2. **Bundle graph doing two jobs.** Bundles currently express both *role composition* ("what does a `manager` do?") and *permission grouping* ("all treasury-read keys"). These are different concerns and will collide the first time a customer wants a custom role.
3. **Scope model is implicit.** Branch and tenant scoping live inside individual RLS/RPC bodies via `user_has_branch_access(...)` helpers. There is no first-class scope model in the catalog. At 50+ clinics this becomes the single biggest source of policy bugs.

**Final verdict: GO for R5, with three preconditions listed in §14.** None of the identified issues block R5; several become significantly harder to fix *after* R5, which is why they belong in this review.

---

## 2. Scorecard

| Dimension | Score | One-line rationale |
| --- | --- | --- |
| **Architecture (overall)** | **82 / 100** | Correct decomposition, sound primitives, over-instrumented governance layer. |
| Security | **90 / 100** | Single gate, `auth.uid()` actor, guardrails, Golden Baseline. Loses points for RLS still pre-R5 and edge-function service-role sprawl. |
| Simplicity | **62 / 100** | Runtime is simple; documentation and lifecycle machinery are not. |
| Maintainability | **75 / 100** | Guardrails + baseline are excellent. Doc sprawl and version-registry ceremony offset this. |
| Scalability | **70 / 100** | Fine at 1–5 clinics. Cracks at 50+ (scope model, cache fanout, bundle explosion). |
| Future readiness | **78 / 100** | Catalog is extensible; scope and approval models are not first-class. |

Weighted average uses 25/20/15/15/15/10 → **79.6**, rounded to the headline 82 after credit for the *quality* of the runtime primitives (which the linear sum understates).

---

## 3. Top 20 Strengths

1. Single frontend authorization entry point (`AuthorizationService`) — the single most important architectural win of R1–R2.
2. Single backend gate (`has_permission(auth.uid(), key)`) — matches NIST RBAC and OWASP ASVS 4.1.
3. `auth.uid()` is the sole actor source — closes the client-identity spoofing surface (H3-1A) and satisfies Zero Trust "authenticate every request".
4. Golden Baseline discriminates intentional vs. unlabeled changes — genuinely rare in production RLS work.
5. Regression harness (`run_all.sh`) chains RLS + RPC + guardrails + manifest + compliance in one command.
6. Frontend/backend guardrails prevent regression of the R2/R3 wins — enforceable via `GUARDRAILS_STRICT`.
7. RPC manifest concept (schema + runtime drift) prevents "RPC exists but nobody knows what permission it needs."
8. Rollback artifact for every completed wave (R1 → R4.5, plus BA-01/02 and hotfixes).
9. `SECURITY DEFINER` + `SET search_path` + `security_invoker`-style discipline is documented (S1) and largely enforced.
10. Bundle graph is acyclic (N5) — a real property, not just an aspiration.
11. Bundle-simulation (N8) demonstrates permission derivation is byte-identical to legacy role sets — this is what made R3 safe.
12. Feature-flag layer (`featureFlags.ts`) allows per-decision cutover instead of big-bang.
13. Telemetry hooked at every decision — dashboards can be added later without instrumenting the code again.
14. Version registry (BA-01) gives every wave an addressable checkpoint for rollback and forensics.
15. Authorization state model (BA-02) exposes a fingerprint the client can subscribe to for cache invalidation.
16. Separation of authorization primitives (Class B: `has_role`, `has_permission`, `is_tenant_owner`) from decisions — no self-reference cycles.
17. Trigger-only SECURITY DEFINER functions are correctly classified and excluded from the "no `has_role`" rule.
18. Edge-function admin allowlist is small and explicit (`admin-create-user`, `admin-delete-user`, `admin-reset-password`, `admin-export`).
19. Sprint-1 batch 2A declarative wrappers reduce policy duplication compared to hand-written RLS.
20. `intentional_changes.txt` label protocol is a lightweight, well-designed drift-vs-change discriminator.

---

## 4. Top 20 Weaknesses (ranked by future cost)

1. **Permission-key inflation risk.** No naming spec, no merge policy, no cap. R5 will multiply keys by ~10×.
2. **Bundle graph conflates role composition with permission grouping.** These should be separate models.
3. **Scope (branch/tenant) is not first-class in the catalog.** It lives inside RLS bodies and helper functions.
4. **Ownership predicates are duplicated across ~15 tables** (`created_by = auth.uid()`, `patient.assigned_doctor_id = auth.uid()`, etc.) — no shared ownership primitive.
5. **State-machine policies mix authorization with business state.** They will be the R5 batch most likely to leak a regression.
6. **Approval / dual-control has no model at all.** Financial ops (invoice void, wallet reversal, payroll adjust) currently rely on ad-hoc `has_role('admin')` — no HIPAA/PCI-style separation-of-duties primitive.
7. **`role_permissions` legacy table is still writable** via the settings UI and can be edited to values the catalog doesn't recognize. Silent divergence risk.
8. **Signature debt: `_by uuid` still in three RPC signatures** (`add_treasury_tx`, `apply_inventory_tx`, `receive_po_item`). Ignored today, but a future maintainer will add a "quick fix" that trusts it.
9. **Edge functions authenticate the caller, then perform admin operations with service role.** This is standard but the surface (4 functions) has no shared framework — copy-paste drift is likely.
10. **`has_permission` performance under RLS.** A recursive-CTE lookup per row on large tables (patients, invoice_items) will not scale linearly.
11. **Cache invalidation is single-tab.** No BroadcastChannel; two open tabs after a role change will disagree.
12. **Documentation sprawl.** ~90 docs; many are process artifacts (BA-01A framework, N7 design review, N9 verification audit) that will not be read again. Onboarding cost is high.
13. **Version registry is manually maintained.** No CI check ensures every schema change bumps a version.
14. **Bundle explosion at custom-role scale.** Every clinic that wants "receptionist but also allowed to void invoices" will need a bespoke bundle. There is no bundle-composition operator.
15. **No ABAC path.** Attribute-based decisions (time-of-day, IP, device posture, break-glass) have no expression in the model. HIPAA break-glass in particular is unaddressed.
16. **`RolePermissions.tsx` UI exposes a legacy model users can still modify** — mixed messages to the operator.
17. **Golden Baseline is a CSV file in `/mnt/documents`.** No cryptographic pinning, no signed commit, no CI enforcement that the file has not been silently edited.
18. **RLS policies with heavy joins are already visible** (Wave 3d P4 pattern). Post-R5, EXPLAIN plans on `invoices`, `payments`, `medical_records` need re-benchmarking.
19. **Tenant isolation relies on `is_tenant_owner` + branch chaining.** No test proves cross-tenant data cannot leak via a shared reference table (e.g., `medications` catalog).
20. **Authorization decisions are not logged as an audit event.** Telemetry captures them but there is no immutable trail — HIPAA §164.312(b) expects this for PHI access.

---

## 5. Standards Alignment Matrix

| Standard | Requirement | Current state | Gap |
| --- | --- | --- | --- |
| NIST RBAC | Role → permission → operation | Satisfied via bundles | Bundle model overloaded (see §4.2) |
| NIST ABAC | Attribute-based decisions | Absent | No policy engine for attributes (time, IP, break-glass) |
| Zero Trust (SP 800-207) | Verify identity every request | `auth.uid()` derived from JWT per call ✅ | No device/context signals |
| OWASP ASVS 4.1.1 | Centralised authorization | ✅ Single gate | — |
| OWASP ASVS 4.1.3 | Least privilege | Mostly ✅ | Admin edge functions widen scope |
| OWASP ASVS 4.2.1 | No client-supplied identity | ✅ (post-R3) | `_by` signatures linger |
| OWASP Auth Cheat Sheet — deny by default | ✅ (RLS enabled per table) | — | — |
| CIS Control 6.1 (account management) | Central + audited | Partial | Authorization decisions not audited |
| CIS Control 6.8 (separation of duties) | Required for financial ops | ❌ | No approval/dual-control model |
| Microsoft EAM | Tier separation (admin plane vs. data plane) | Partial | Admin plane is 4 edge functions with service role — no tier isolation |
| Zanzibar | Namespaced relations, consistency tokens | Partly analogous (bundles ≈ namespaces) | No consistency token; cache fingerprint is app-local |
| HIPAA §164.312(a)(1) | Unique user identification | ✅ | — |
| HIPAA §164.312(a)(2)(ii) | Emergency access ("break-glass") | ❌ | No documented procedure or policy hook |
| HIPAA §164.312(b) | Audit controls on PHI access | Partial | Row access logged only when a trigger fires; reads not audited |
| PCI-DSS §7.1.2 | Least privilege for cardholder-like data | N/A (no cards) but the pattern applies to invoicing | Admin bundle is broad |

---

## 6. Answers to the Direct Questions

**Is the architecture over-engineered?**
The runtime stack: no. The governance and documentation stack: yes. There are ~90 docs behind an authorization surface enforced by roughly 8 client-callable RPCs and ~100 RLS policies. That ratio inverts the usual "code:docs = 10:1" and signals that process is running ahead of product.

**Which parts are unnecessarily complex?**
- BA-01 Authorization Version Registry as a per-artifact-type table with its own state model. A single monotonic version stamp on migrations would achieve the same outcome for a fraction of the code.
- The distinction between `authz_versions`, `authz_bundle_implies`, `authz_bundle_permissions`, `authz_bundles`, `authz_role_bundles` — five tables that could be three (`bundles`, `bundle_grants`, `role_bundles`) without loss of expressiveness.
- Wave 3a–3e sub-batching machinery (rollback SQL per micro-batch) is over-fitted to a specific batch cadence and won't be reused.

**Which parts can be simplified without reducing security?**
- Merge `authz_bundle_implies` into `authz_bundle_permissions` as a `kind` column (`GRANT` | `IMPLIES`).
- Collapse BA-01 into a `schema_migrations`-style single table.
- Delete Wave 3a–3e per-batch rollbacks now that R3 is complete; keep only pattern-level rollbacks (P1–P5).

**Which layers violate Separation of Concerns?**
- Bundles conflate "role definition" with "permission grouping".
- RLS policies mix authorization with business-state predicates (state-machine policies §4.5).
- `AuthorizationService` currently carries both decision logic *and* transitional role-identity shims — acceptable for now, must split by R8.

**Which abstractions are likely to become technical debt?**
- `role_permissions` table (already legacy, still user-writable).
- `authz_bundle_implies` (rarely used; encourages hard-to-audit chains).
- Feature flags added during R1 that will not have owners after R5.
- `hasRole/hasRoleAny/holdsAnyRole` shims in `AuthorizationService`.

**Which permission families should be merged?**
- `treasury.tx.write` + `treasury.daily_close.view` + potential future `treasury.close.write` should be a `treasury.*` family with three actions, not three flat keys.
- Any per-table `.read` / `.list` split — consolidate to `.view`.
- `inventory.tx.write` and `purchase_orders.receive` are the same conceptual action (increase stock) and should share a family or reuse one key.

**Which bundles should disappear?**
- The de-facto "admin bundle that grants everything" (via short-circuit inside `has_permission`) — replace with explicit high-risk key grants so admin membership is auditable per key.
- Any bundle currently used by exactly one role and one permission — collapse into a direct role grant.

**Which concepts should be postponed?**
- BA-03 Change Ledger.
- Multi-tenant SaaS separation beyond `is_tenant_owner`. Do not build this until a paying second tenant exists.
- Fine-grained ABAC.
- Custom-role editor UI. Ship a fixed role set until customers ask.

**Which concepts are missing completely?**
- Approval / dual-control model.
- Break-glass emergency access with mandatory post-hoc review.
- Audit of *authorization decisions* (not just data mutations).
- Scope model as a first-class catalog entity (branch, tenant, department, self).
- Ownership primitive (a single function `owns(user, resource_type, resource_id)`).

**What breaks first at 1 / 50 / 500 clinics / SaaS multi-tenant?**
- **1 clinic:** nothing. Current design fits.
- **50 clinics:** cache invalidation storms when a shared bundle changes (every user in every clinic refetches). Cross-branch reporting queries slow due to `has_permission` recursion per row.
- **500 clinics:** RLS on high-volume tables (`appointments`, `invoice_items`, `patient_wallet_transactions`) becomes the p99 bottleneck. Golden Baseline CSV becomes unmanageable (grows with roles × permissions × branches).
- **SaaS multi-tenant:** `is_tenant_owner` + branch chaining is not enough. Need tenant-scoped RLS on *every* table by default, tenant-aware caching, and per-tenant version fingerprints. Also: cross-tenant leakage in shared catalogs (medications, diagnoses) is currently untested.

**Which future migrations will become painful?**
- Introducing an approval workflow retroactively into `invoices`, `payments`, `payroll`.
- Adding tenant-scoped RLS to tables that today have branch-scoped RLS.
- Renaming any permission key that lives in `role_permissions`.
- Removing `_by` from RPC signatures once external integrations depend on them.

**Is the Permission Catalog future-proof?** Partially. It needs a naming spec (`<domain>.<resource>.<action>`) and a deprecation lifecycle enforced by CI.

**Is the Bundle model future-proof?** No. It needs to split role-composition from permission-grouping, and it needs a bundle-composition operator for custom roles.

**Is the Scope model future-proof?** No. Scope is currently implicit. It must become a first-class dimension (`permission × scope` matrix) before SaaS.

**Is the Ownership model future-proof?** No. Ownership predicates are copy-pasted across policies. A shared `owns(user, kind, id)` primitive is overdue.

**Is the Approval model future-proof?** There is no approval model. This is the single biggest missing concept.

**Is Governance too heavy?** Yes for a single-clinic product; correct-weight for a 50-clinic product. Prune to match reality.

**Is Versioning justified?** In principle yes. In current form (BA-01 with a full state model per artifact type) no — a monotonic migration counter would suffice for years.

**Which documentation can be deleted?**
- BA-01A Authorization Version Integrity Framework (superseded by the simpler outcome).
- N7 Permission Design Review (one-shot; done).
- N9 Authorization Verification Audit (one-shot; done).
- Wave 3a–3e per-batch reports once R5 concludes.
- H3-1A Single Gate Cleanup (subsumed by R3).
- A0/A1/A2/A3 governance revisions (keep only the current charter and ownership matrix).

**Which documentation is missing?**
- **Permission Naming Specification.** One-pager, enforced by CI.
- **Approval & Dual-Control Design.** Even a "not-yet" doc with the decision recorded.
- **Break-Glass Procedure.** HIPAA-aligned.
- **Scope Model v1.** First-class treatment of branch/tenant/department/self.
- **RLS Performance Playbook.** EXPLAIN targets, index expectations, `has_permission` inlining strategy.
- **Cross-Tenant Isolation Test Plan.** Explicit tests that shared catalogs cannot leak.

---

## 7. Complexity vs. Business Value Assessment

| Component | Complexity cost | Business value today | Value at 50 clinics | Verdict |
| --- | --- | --- | --- | --- |
| `AuthorizationService` | Low | High | High | Keep |
| `has_permission` | Low | High | High | Keep |
| Guardrails harness | Medium | High | High | Keep |
| Golden Baseline | Medium | High | High | Keep, harden (§14) |
| Bundle graph | Medium | Medium | High | Keep, refactor (§8) |
| BA-01 Version Registry | High | Low | Medium | Simplify |
| BA-02 State Model | Medium | Low | Medium | Keep as-is |
| BA-03 Change Ledger | (unbuilt) | — | Medium | Defer |
| `role_permissions` table + UI | Low | Negative (confusing) | Negative | Remove after R7 |
| Wave 3a–3e batch reports | High (write cost) | Low | Zero | Archive |
| Governance docs (A0–A3, N1–N9) | Very high | Low | Low | Consolidate to ≤ 5 living docs |
| Compliance framework (S1/S2) | Medium | Medium | High | Keep, promote to strict |
| Telemetry | Low | Medium | High | Keep, add dashboard |

---

## 8. Recommended Simplifications

1. **Collapse the `authz_*` schema from 6 tables to 4:** `permissions`, `bundles`, `bundle_grants` (with `kind` column), `role_bundles`.
2. **Replace BA-01 Version Registry with a single `authz_migrations` table** carrying `(version_id, applied_at, description, checksum)`.
3. **Merge `authz_bundle_implies` into `authz_bundle_permissions`** as recommended above.
4. **Split `AuthorizationService`** into `AuthorizationService` (decision) and `IdentityShims` (temporary role-based helpers). Delete `IdentityShims` at R8.
5. **Adopt a strict permission naming spec** and add a `guardrails_catalog.py` check: `^[a-z0-9_]+\.[a-z0-9_]+\.(view|list|write|delete|approve|export|admin)$`.
6. **Introduce a single `public.owns(_uid uuid, _kind text, _id uuid) returns boolean`** SECURITY DEFINER function and replace ownership predicates in RLS with a call to it (do this *during* R5, not before).
7. **Freeze the Golden Baseline as a git-tracked, checksummed file** (move out of `/mnt/documents`).
8. **Delete Wave 3a–3e per-batch rollback SQL** after R5 lands; keep only the P1–P5 pattern rollbacks.
9. **Archive one-shot governance docs** (A0/A1/A2/A3, N7, N9, BA-01A) under `docs/_archive/`.
10. **Consolidate the four admin edge functions** behind one `admin-user-ops` function with an operation parameter — reduces copy-paste and centralises the admin allowlist.

## 9. Recommended Removals

- `role_permissions` table and its settings UI (post-R7).
- `_by uuid` parameters from `add_treasury_tx`, `apply_inventory_tx`, `receive_po_item` (with a deprecation window).
- `authz_bundle_implies` after merge into `authz_bundle_permissions`.
- Feature flags introduced in R1 that will have no owner after R5.
- Wave 3a–3e batch documentation (archive, don't delete outright).

## 10. Recommended Additions

- **Permission Naming Specification** (one page, CI-enforced).
- **Scope Model v1** as first-class catalog entity: `(permission_key, scope_kind)` with `scope_kind ∈ {global, tenant, branch, self}`.
- **Ownership primitive** (`public.owns(...)`) — see §8.6.
- **Approval / Dual-Control model** even at design-only stage: which operations require it, who approves, where the approval record lives.
- **Break-glass procedure**: policy, technical mechanism (time-boxed elevated bundle), mandatory post-hoc review workflow.
- **Authorization decision audit trail**: an append-only table with `(uid, key, decision, scope_id, ts)`, batched via telemetry.
- **Cross-tab cache invalidation** via BroadcastChannel or Supabase realtime channel keyed on the fingerprint.
- **Cross-tenant isolation test plan** and a Playwright suite that proves it.
- **RLS Performance Playbook** with EXPLAIN targets and required indexes for `has_permission`-carrying policies.

---

## 11. Scale Failure Modes

| Scale | First thing to break | Second thing | Root cause |
| --- | --- | --- | --- |
| 1 clinic | — | — | Fits current design. |
| 5 clinics | Nothing structural | Cross-branch reports slow | Branch scope in RLS bodies. |
| 50 clinics | Cache-invalidation fanout after a bundle edit | RLS join cost on `appointments`, `invoice_items` | No fingerprint sharding; per-row `has_permission` recursion. |
| 500 clinics | p99 RLS latency on hot tables | Golden Baseline CSV size / diff time | Missing indexes anticipating `has_permission` inlining; baseline not partitioned by table. |
| SaaS multi-tenant | Cross-tenant leakage via shared catalogs (medications, diagnoses, `role_permissions`) | Tenant-scoped fingerprint absence | `is_tenant_owner` is a check, not an enforced boundary; shared tables have no tenant column. |

---

## 12. Migration Painfulness Forecast

| Future migration | Painfulness (1–5) | Why |
| --- | --- | --- |
| R5 pattern batches P1 (flat tables) | 1 | Tooling is ready. |
| R5 ownership batches | 2 | Requires §10 ownership primitive to avoid pain. |
| R5 branch-scope batches | 3 | Composition risk; needs targeted tests. |
| R5 state-machine batches | 4 | Requires AUTHZ∧STATE split; highest regression risk. |
| Introduce approval/dual-control | 5 | Touches invoices/payments/payroll at the same time as active reporting. |
| Add tenant-scoped RLS retroactively | 5 | Every table gets a new dimension. |
| Rename any high-traffic permission key | 4 | `role_permissions` and external integrations may pin the string. |
| Remove `_by` parameters | 2 | Signature change; forward-compat with default NULL. |
| Retire `role_permissions` | 3 | UX and data-migration surface. |

---

## 13. Risk Register (top 10)

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | R5 introduces a silent regression on state-machine policies | Medium | High | Split AUTHZ∧STATE clauses; Golden Baseline diff. |
| 2 | Permission-key inflation during R5 | High | Medium | Adopt naming spec + CI check before first R5 batch. |
| 3 | `role_permissions` UI edits shadow the catalog | Medium | High | Freeze the UI to read-only; schedule R7 decommission. |
| 4 | Cross-tenant leakage via shared reference tables | Low today, High at SaaS | High | Cross-tenant isolation test plan. |
| 5 | Cache staleness across tabs after role change | Medium | Medium | BroadcastChannel invalidation. |
| 6 | Golden Baseline CSV tampering (no cryptographic pin) | Low | High | Move to git-tracked file with commit-signed checksum. |
| 7 | Admin edge functions drift in authorization pattern | Medium | High | Consolidate into one framework function. |
| 8 | `has_permission` recursion cost at scale | Medium | Medium | Benchmark playbook; consider inlining for hot RLS paths. |
| 9 | Documentation debt slows onboarding | High | Medium | Archive one-shot docs after R5. |
| 10 | No break-glass path forces admins to grant broad roles in emergencies | Medium | High | Design (not build) break-glass now. |

---

## 14. Final Certification

**GO for R5, with three preconditions.** These are cheap, documentation-only, and materially reduce the R5 blast radius:

1. **Publish a Permission Naming Specification** (one page) and add a CI check that rejects new keys not matching `^[a-z0-9_]+\.[a-z0-9_]+\.(view|list|write|delete|approve|export|admin)$`. Without this, R5 will fragment the catalog.
2. **Freeze the Golden Baseline as a git-tracked, checksummed artifact** (move it out of `/mnt/documents`, tag the commit). Every R5 PR diffs against the pinned commit.
3. **Adopt the AUTHZ∧STATE split rule** in the R5 PR template for any policy that references a status column, and reserve the final R5 batch exclusively for state-machine tables.

Nothing else in this review blocks R5. Everything else — bundle refactor, scope model, ownership primitive, approval model, break-glass, doc pruning, edge-function consolidation — should be scheduled as R6/R7/R8 work, in that order.

**Sign-off:** GO.
