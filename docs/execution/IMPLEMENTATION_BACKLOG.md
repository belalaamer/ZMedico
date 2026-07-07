# Authorization v2 — Master Execution Backlog

**Mode:** Implementation. Architecture is frozen. No new design docs.
**Source of truth:** RC2 (`docs/governance/A3_AUTHORIZATION_V2_RC1.md` + `docs/governance/RC1_1_RC2_REMEDIATION.md`).
**Behavior drift policy:** Every task MUST declare "Expected behavior change = None" unless the RC2 delta explicitly authorizes it.

---

## Phase 1 — Implementation Backlog

Complexity: S ≤ 0.5d · M ≤ 2d · L ≤ 5d · XL > 5d.
Risk: L / M / H. Rollback: Y / N.

### Group 1 — Backend Authorization (schema + gate function)

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| BA-01 | `permissions_version` table + trigger | Single-row `authz_version` table bumped on any change to `role_permissions` / `authz_*`. Enables cache-busting. | S | — | L | None | Y | 1 migration |
| BA-02 | `has_permission(uid, key)` hardening | Ensure `STABLE`, `SET search_path`, indexed lookup `(user_id, permission)`; add missing index if absent. | S | BA-01 | L | None | Y | 1 migration |
| BA-03 | Pre-Wave-A hardening migration | Lock 9 SaaS/platform tables to `service_role` per RC2 §5 (F-03). | M | — | M | Locks a currently-broad surface (approved) | Y (SQL file) | 1 migration |
| BA-04 | Wave A additive grant migration | Insert new keys (`prescriptions.write`, `patients.consent.write`, tightened `patients.export`) into `role_permissions`. | M | BA-01,BA-03 | L | None (adds gates matching current defaults) | Y | 1 migration |
| BA-05 | Wave B cutover — RLS repointing | 19 policies repointed to `has_permission(...)`, one table cluster per PR. | XL | BA-04, RS-01..04 | H | None (parity-tested) | Y per table | ~19 migrations |
| BA-06 | Wave C dead-permission removal | Drop unused permission rows once soak is clean. | S | BA-05 + 1 sprint soak | L | None | Y | 1 migration |

### Group 2 — Frontend Authorization

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| FA-01 | Cache-bust `usePermissions` | Subscribe to `authz_version`; refetch on mismatch. | S | BA-01 | L | None | Y | `src/hooks/usePermissions.ts` |
| FA-02 | Migrate `isAdmin`/`roles.includes` call sites to `authz.can(...)` / `authz.isSuperAdmin()` | 6 concrete files identified. Replace direct role checks with permission keys where a key exists. | M | — | L | None (parity tests) | Y (git revert) | 6 files |
| FA-03 | Route `PermissionRoute` through `AuthorizationService` | Preserve `adminOnly` prop; internally call `authz.isSuperAdmin()`. | S | FA-02 | L | None | Y | `src/components/PermissionRoute.tsx` |
| FA-04 | Retire `useUserRole` direct consumers | 13 call sites; keep hook but proxy through `useAuthorization`. | M | FA-02 | L | None | Y | 13 files |
| FA-05 | `<Can />` audit + fill gaps | 14 usages; ensure every gated UI uses `<Can>` or `authz.can`. | M | FA-02 | L | None | Y | ~20 files |

### Group 3 — RPC Security (SECURITY DEFINER Standard v1.1)

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| RPC-01 | H3-3 `add_treasury_tx` remediation | Bring to full Standard v1 (single `has_permission` gate, no client actor, R7 audit). | M | — | M | None (parity) | Y | 1 migration |
| RPC-02 | H3-4 `apply_inventory_tx` remediation | Same pattern. | M | — | M | None | Y | 1 migration |
| RPC-03 | H3-5 `receive_po_item` remediation | Same pattern. | M | — | M | None | Y | 1 migration |
| RPC-04 | H3-6 `apply_coupon_code` remediation | Same pattern; remove `has_role`. | M | — | M | None | Y | 1 migration |
| RPC-05 | `export_patients_rpc` | New RPC — sole path for patient bulk export. `patients.export` (admin only). | M | BA-04 | M | Adds gate (approved F-06) | Y | 1 migration + 1 UI call |
| RPC-06 | `record_consent` / `revoke_consent` RPCs | Consent lifecycle (approved F-17). | M | BA-04 | L | Adds surface (approved) | Y | 1 migration |
| RPC-07 | `refund_payment` RPC | Sole path for payment refunds (F-13). | M | — | M | Adds gate | Y | 1 migration |
| RPC-08 | RPC Manifest — enumeration | Commit `scripts/authz/rpc_manifest.yaml` with 12 required entries. | S | — | L | None | Y | 1 file |
| RPC-09 | RPC Manifest checker | `scripts/authz/check_rpc_manifest.py`; wire into `run_all.sh`. | S | RPC-08 | L | None | Y | 2 files |

### Group 4 — RLS Migration

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| RS-01 | RLS cutover — Finance cluster | invoices, invoice_items, payments, expenses, treasury*. | L | BA-04, RPC-01..04 | H | None | Y per table | ~6 migrations |
| RS-02 | RLS cutover — Clinical cluster | medical_records, prescriptions*, dental_chart, vital_signs, physio_*. | L | BA-04 | H | None | Y | ~8 migrations |
| RS-03 | RLS cutover — HR cluster | staff_profiles, payroll, leave_requests, performance_reviews, attendance. | L | BA-04 | H | None | Y | ~5 migrations |
| RS-04 | RLS cutover — Inventory + Settings tail | products, purchase_orders*, communication_templates, notification_settings. | M | BA-04 | M | None | Y | ~5 migrations |

### Group 5 — Column Security

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| CS-01 | Sensitive column projection audit | Confirm salary/national ID/consent columns are only reachable through `has_permission('hr.sensitive.read')` view or gated select. | M | RS-03 | M | None | Y | 1–2 migrations |
| CS-02 | Storage bucket RLS (`patient-docs`) | Verify `storage_patient_docs_branch_allowed` gates against `has_permission('patients.documents.read')`. | S | — | L | None | Y | 1 migration |

### Group 6 — Audit

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| AU-01 | R7 sweep | Confirm every RPC writing `audit_logs` sources `user_id` from `auth.uid()`. Fix any raw-parameter callers. | M | RPC-01..07 | M | None | Y | migrations |
| AU-02 | `audit.export` gate wiring | Point `admin-export` edge function + Backup/Export UI to `authz.can('audit.export')`. | S | BA-04 | L | None | Y | 2 files |
| AU-03 | Immutable audit assurance | Add trigger blocking `UPDATE`/`DELETE` on `audit_logs` (except service_role). | S | — | L | None | Y | 1 migration |

### Group 7 — Testing

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| T-01 | Extend compliance checker for R10–R14 | Advisory in Wave A, strict at Wave B start. | M | — | L | None | Y | `scripts/authz/compliance_definer.py` |
| T-02 | Regression harness — pre/post-cutover snapshots | Refresh `golden_rpc_baseline.csv` only after Wave B green; label all diffs. | S | RS-01..04 | L | None | Y | baseline CSVs |
| T-03 | Playwright rbac.deep — RC2 additions | Cover `prescriptions.write`, tightened `patients.export`, consent RPCs, `refund_payment`. | M | RPC-05..07 | M | None | Y | `tests/playwright/rbac.deep.spec.ts` |
| T-04 | Vitest — AuthorizationService parity for new keys | Add contract cases for the RC2 keys. | S | FA-02 | L | None | Y | 1 test file |
| T-05 | Load / performance smoke on `has_permission` | Ensure p95 unchanged after RLS repoint. | S | RS-01 | L | None | Y | ad-hoc script |

### Group 8 — Cleanup

| ID | Title | Description | Cx | Deps | Risk | Behavior Δ | Rollback | Files |
|---|---|---|---|---|---|---|---|---|
| C-01 | Delete dead permission keys | Per `N4_DEAD_PERMISSION_REPORT.md`. | S | BA-06 | L | None | Y | 1 migration |
| C-02 | Delete `WAVE1_AUTHZ_FOUNDATION.md` legacy adapters | Only after zero `usePermissions()` direct callers remain outside `useAuthorization`. | S | FA-04 | L | None | Y | 1–2 files |
| C-03 | Archive superseded docs (see Phase 4) | Move to `docs/_archive/`. Zero code impact. | S | — | L | None | Y | git mv |
| C-04 | Remove `has_role()` references from edge functions | 3 admin functions call `has_role` directly; switch to `has_permission('admin.*')`. | S | BA-04 | L | None | Y | 3 files |
| C-05 | Support triage runbook | `AUTHORIZATION_SUPPORT_RUNBOOK.md` (operational, not architecture). | S | RPC-08 | L | None | Y | 1 file |

---

## Phase 2 — Documentation Debt Classification

Canonical dependency tree (topic → canonical doc):

```text
Architecture ................ docs/governance/A3_AUTHORIZATION_V2_RC1.md
  └─ RC2 delta .............. docs/governance/RC1_1_RC2_REMEDIATION.md
Permission Catalog .......... docs/PERMISSION_CATALOG.md
Role Architecture ........... docs/ROLE_ARCHITECTURE.md
Scope & Ownership ........... docs/SCOPE_OWNERSHIP_MODEL.md
Business Operations ......... docs/BUSINESS_OPERATIONS_CATALOG.md
SECURITY DEFINER Standard ... docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md
Compliance Framework ........ docs/security/S2_COMPLIANCE_FRAMEWORK.md
Compliance Report (live) .... docs/security/S2_COMPLIANCE_REPORT.md
Regression Harness .......... docs/AUTHORIZATION_REGRESSION_HARNESS.md
Golden Baseline ............. docs/GOLDEN_AUTHORIZATION_BASELINE.md
Governance Charter .......... docs/governance/CHARTER.md
Lifecycle Policy ............ docs/governance/LIFECYCLE_POLICY.md
Product Decisions log ....... docs/governance/PRODUCT_DECISIONS.md
Readiness Gate .............. docs/governance/PROGRAM_GATE_READINESS_REVIEW.md
Execution Backlog (this) .... docs/execution/IMPLEMENTATION_BACKLOG.md
```

Classification of every doc file present:

| File | Status | Reason |
|---|---|---|
| docs/PERMISSION_CATALOG.md | **Canonical** | Frozen catalog (56 keys post-RC2). |
| docs/ROLE_ARCHITECTURE.md | **Canonical** | Frozen 6-role model. |
| docs/SCOPE_OWNERSHIP_MODEL.md | **Canonical** | Frozen. |
| docs/BUSINESS_OPERATIONS_CATALOG.md | **Canonical** | Frozen. |
| docs/AUTHORIZATION_REGRESSION_HARNESS.md | **Canonical** | Active harness contract. |
| docs/GOLDEN_AUTHORIZATION_BASELINE.md | **Canonical** | Active baseline reference. |
| docs/AUTHORIZATION_INVENTORY.md | **Historical** | Superseded by PERMISSION_CATALOG + BUSINESS_OPS. |
| docs/BACKEND_AUTHORIZATION_MIGRATION_PLAN.md | **Superseded** | Replaced by RC2 wave plan. |
| docs/RBAC_AUDIT.md | **Historical** | Pre-RC1 audit. |
| docs/RBAC_MATRIX.md | **Superseded** | Live matrix now in Golden Baseline CSV. |
| docs/WAVE1_AUTHZ_FOUNDATION.md | **Historical** | Wave 1 completion note. |
| docs/SPRINT1_BATCH2A_DECLARATIVE_WRAPPERS.md | **Historical** | Sprint completion note. |
| docs/governance/CHARTER.md | **Canonical** | Governance root. |
| docs/governance/LIFECYCLE_POLICY.md | **Canonical** | Freeze policy source. |
| docs/governance/OWNERSHIP_MATRIX.md | **Canonical** | Ownership routing. |
| docs/governance/PERMISSION_STATUS_REGISTER.md | **Canonical** | Live register. |
| docs/governance/PRODUCT_DECISIONS.md | **Canonical** | Append-only decision log. |
| docs/governance/IMPLEMENTATION_PRIORITY.md | **Superseded** | Replaced by this backlog. |
| docs/governance/A0_COMPLEXITY_REVIEW.md | **Archived** | Design phase. |
| docs/governance/A1_SIMPLIFICATION_PLAN.md | **Archived** | Design phase. |
| docs/governance/A2_BUSINESS_VALIDATION.md | **Archived** | Design phase. |
| docs/governance/A3_AUTHORIZATION_V2_RC1.md | **Canonical (frozen)** | Architecture RC1. |
| docs/governance/V1_RC1_ADVERSARIAL_REVIEW.md | **Archived** | Review artifact. |
| docs/governance/RC1_1_RC2_REMEDIATION.md | **Canonical (frozen)** | RC2 delta. |
| docs/governance/PROGRAM_GATE_READINESS_REVIEW.md | **Canonical** | Gate decision. |
| docs/normalization/N1..N9 | **Archived** | Analysis inputs to RC1/RC2; superseded by frozen catalog. |
| docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md | **Canonical (frozen)** | Standard. |
| docs/security/S1_5_CONFORMANCE_AUDIT.md | **Historical** | Point-in-time audit. |
| docs/security/S2_COMPLIANCE_FRAMEWORK.md | **Canonical** | Enforcement contract. |
| docs/security/S2_COMPLIANCE_REPORT.md | **Live artifact** | Regenerated per run. |
| docs/security/H3_1_*, H3_1A_*, H3_2_* | **Historical** | Completed hotfixes. |
| docs/security/H3_SECURITY_DEFINER_RPC_REVIEW.md | **Active tracker** | Until RPC-01..04 close. |
| docs/wave3/PILOT_* | **Historical** | Pilot completed. |
| docs/wave3a/* | **Historical** | Batch complete. |
| docs/wave3b/WAVE3B_BRANCH_AUTHORIZATION_ANALYSIS.md | **Archived** | Analysis. |
| docs/wave3c/WAVE3C_PATTERN_A_RATIFICATION.md | **Superseded** | Rolled into RC1 catalog. |
| docs/wave3d/WAVE3D_AUTHORIZATION_PATTERN_CATALOG.md | **Superseded** | Rolled into RC1. |
| docs/wave3e/AUTHORIZATION_NORMALIZATION_REPORT.md | **Historical** | Wave 3e completion. |
| docs/wave3e/WAVE3E_PATTERN_P4_MIGRATION.md | **Historical** | Completed. |

Conflicts detected: none material after applying the classification above. `BACKEND_AUTHORIZATION_MIGRATION_PLAN.md` and `IMPLEMENTATION_PRIORITY.md` both contain sequencing that predates RC2 — both are marked **Superseded** so RC2 wins by construction.

---

## Phase 3 — Technical Debt Inventory

Scan performed against `src/`, `supabase/functions/`, `scripts/authz/`.

| ID | Issue | Location(s) | Severity |
|---|---|---|---|
| TD-01 | Direct `roles.includes("admin"/"manager"/"hr"/"doctor")` in components | `src/pages/treasury/DailyClose.tsx`, `src/pages/hr/StaffDetail.tsx`, `src/pages/hr/StaffBranchesTab.tsx`, `src/pages/reports/DoctorCommissions.tsx`, `src/hooks/useUserRole.ts` (definition site — expected) | **High** |
| TD-02 | `isAdmin` guards without a permission key equivalent | `src/pages/settings/BackupExport.tsx` (5 buttons), `src/pages/inventory/PurchaseOrders.tsx` (delete/edit guards) | **High** |
| TD-03 | Edge functions call `has_role(...)` directly | `supabase/functions/admin-create-user`, `admin-delete-user`, `admin-reset-password` | **High** |
| TD-04 | 4 SECURITY DEFINER RPCs FAIL Standard v1 | `add_treasury_tx`, `apply_inventory_tx`, `receive_po_item`, `apply_coupon_code` (per S2 report) | **Critical** |
| TD-05 | RPCs emitting `has_role` warnings (R9) | `apply_coupon_code`, `check_expiry_alerts`, `fn_treasury_day_cash_summary`, `staff_target_actual`, `tg_*_self_guard` | **Medium** |
| TD-06 | No RPC Manifest presence check in CI | `scripts/authz/run_all.sh` | **High** |
| TD-07 | `usePermissions` has no cache-bust — long sessions see stale grants | `src/hooks/usePermissions.ts` | **High** |
| TD-08 | Missing `refund_payment` RPC — deletes/adjustments possible off-book | `src/pages/payments/*` uses direct table writes | **Critical** |
| TD-09 | Missing consent RPCs | none — new surface | **High** |
| TD-10 | `patients.export` still admin+manager | `src/lib/rolePermissions.ts` defaults | **High** |
| TD-11 | Dead permission keys still in defaults | Per `N4_DEAD_PERMISSION_REPORT.md` | **Low** |
| TD-12 | Legacy `PermissionRoute` bypasses `AuthorizationService` for `adminOnly` prop | `src/components/PermissionRoute.tsx` | **Medium** |
| TD-13 | 13 direct `useUserRole()` consumers — duplicate role-derivation logic | Cross-app | **Medium** |
| TD-14 | Duplicated branch checks in RPCs vs `user_has_branch_access_*` helpers | Multiple RPCs re-implement branch scoping inline | **Medium** |
| TD-15 | `audit_logs` allows UPDATE/DELETE via any role with the permission — no immutability trigger | DB | **High** |
| TD-16 | 9 SaaS/platform tables still writable via broad grants | Per RC2 F-03 | **Critical** |
| TD-17 | Inconsistent permission naming (`patients.documents.read` vs `patient_documents.read`) | catalog vs live role_permissions rows | **Medium** |
| TD-18 | Dead helper `is_tenant_owner` — no remaining callers | DB | **Low** |
| TD-19 | Wave-3 pilot compatibility shims not removed | `docs/wave3/PILOT_*` rollback SQLs still referenced | **Low** |
| TD-20 | `<Can />` gate parity untested for new RC2 keys | `src/components/Can.parity.test.tsx` | **Medium** |

Distribution: **3 Critical · 8 High · 6 Medium · 3 Low.**

---

## Phase 4 — Frozen Canonical Set

The permanent source of truth is exactly:

1. `docs/governance/A3_AUTHORIZATION_V2_RC1.md` — Architecture (RC1 body + RC2 delta reference).
2. `docs/governance/RC1_1_RC2_REMEDIATION.md` — RC2 mandatory delta.
3. `docs/PERMISSION_CATALOG.md` — Permission Catalog (56 keys).
4. `docs/ROLE_ARCHITECTURE.md` — Role model (6 roles).
5. `docs/SCOPE_OWNERSHIP_MODEL.md` — Scope & Ownership.
6. `docs/BUSINESS_OPERATIONS_CATALOG.md` — Business Operations.
7. `docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md` — Security Standard.
8. `docs/security/S2_COMPLIANCE_FRAMEWORK.md` — Compliance Framework.
9. `docs/AUTHORIZATION_REGRESSION_HARNESS.md` — Regression Harness.
10. `docs/GOLDEN_AUTHORIZATION_BASELINE.md` — Golden Baseline.
11. `docs/governance/CHARTER.md` + `LIFECYCLE_POLICY.md` + `PRODUCT_DECISIONS.md` + `OWNERSHIP_MATRIX.md` + `PERMISSION_STATUS_REGISTER.md` — Governance stack.
12. `docs/execution/IMPLEMENTATION_BACKLOG.md` (this file) — Execution backlog.

Everything else is **Historical**, **Superseded**, **Archived**, or a **Live artifact** regenerated by tooling. No further edits to those files are permitted; they exist for auditability only.

---

## Phase 5 — Final Execution Roadmap

Every task below is executable and gated on the prior milestone. No design work remains.

### Milestone M1 — Foundations (blocks Wave A)
1. RPC-08 · commit `rpc_manifest.yaml`.
2. RPC-09 · ship manifest checker + wire into `run_all.sh`.
3. BA-01 · `authz_version` table + trigger.
4. BA-02 · `has_permission` hardening + index.
5. FA-01 · client cache-bust.
6. AU-03 · `audit_logs` immutability trigger.
7. T-01 · extend compliance checker (R10–R14 advisory).

**Exit criteria:** harness green, compliance report unchanged, all Playwright suites pass.

### Milestone M2 — Pre-Wave-A Hardening
8. BA-03 · lock SaaS/platform tables to `service_role`.
9. AU-02 · route `admin-export` + Backup UI through `audit.export`.
10. C-04 · replace `has_role()` in the 3 admin edge functions with `has_permission('admin.*')`.

**Exit criteria:** Golden Baseline diff labeled and accepted; SaaS tables no longer reachable by tenant roles.

### Milestone M3 — Wave A (additive)
11. BA-04 · additive role_permissions inserts (RC2 keys).
12. FA-02 · migrate 6 concrete role-check call sites to `authz.can/isSuperAdmin`.
13. FA-03 · route `PermissionRoute` through `AuthorizationService`.
14. FA-04 · retire direct `useUserRole` consumers.
15. FA-05 · `<Can />` gap fill.
16. T-04 · Vitest parity for RC2 keys.

**Exit criteria:** zero occurrences of `roles.includes` / `role ===` / raw `isAdmin` outside `useUserRole.ts` and `AuthorizationService`.

### Milestone M4 — RPC Standard Conformance (blocks Wave B)
17. RPC-01 · `add_treasury_tx`.
18. RPC-02 · `apply_inventory_tx`.
19. RPC-03 · `receive_po_item`.
20. RPC-04 · `apply_coupon_code`.
21. RPC-05 · `export_patients_rpc`.
22. RPC-06 · consent RPCs.
23. RPC-07 · `refund_payment`.
24. AU-01 · R7 sweep.
25. T-01 · promote R10–R14 to strict.

**Exit criteria:** `S2_COMPLIANCE_REPORT.md` shows zero FAIL, zero R7 warnings.

### Milestone M5 — Wave B RLS Cutover
26. RS-01 · Finance cluster.
27. RS-02 · Clinical cluster.
28. RS-03 · HR cluster.
29. RS-04 · Inventory + Settings tail.
30. CS-01 · sensitive-column projection audit.
31. CS-02 · storage bucket RLS.
32. T-02 · refresh Golden RPC baseline.
33. T-03 · Playwright rbac.deep additions.
34. T-05 · perf smoke.

**Exit criteria:** all harness diffs labeled; p95 within ±5% of pre-cutover; 1-sprint production soak.

### Milestone M6 — Wave C Cleanup
35. BA-06 · drop dead permission rows.
36. C-01 · delete dead permission keys.
37. C-02 · remove Wave 1 legacy adapters.
38. C-03 · git-mv archived docs into `docs/_archive/`.
39. C-05 · publish support triage runbook.

**Exit criteria:** repository contains only Canonical docs (per Phase 4) at the top level; all others under `docs/_archive/`.

### Global gates
- No new architecture document may be created without a Product Decision entry.
- Every migration lands with (a) rollback SQL, (b) refreshed compliance report, (c) baseline diff labeled in `scripts/authz/intentional_changes.txt`.
- CI blocks on: harness diff, compliance FAIL (strict from M4 onward), manifest presence, Playwright rbac.deep.

**End of backlog. Execution begins at M1 · RPC-08.**
