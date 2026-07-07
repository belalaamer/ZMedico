# A3 — Authorization Model v2.0 RC1 (Release Candidate)

**Status:** Documentation only. No SQL, code, or migrations.
**Predecessors:** A0 (complexity), A1 (simplification plan), A2 (business validation, APPROVE WITH CHANGES).
**Purpose:** Freeze the design surface. After acceptance of RC1, no authorization change ships without the freeze-policy gate in §7.

---

## 0. Scope of RC1

RC1 = A1 target model + the three A2-approved deltas, and **nothing else**.

Approved deltas incorporated (verbatim from A2 §7):
1. Add permission key `audit.export` (admin-only).
2. Repoint `settings.backup.export` operation → `audit.read` gate (no new key).
3. Add Compliance Rule **R10** — approval-workflow tables (`expenses`, `purchase_orders`, `leave_requests`, `payroll`, refund path on `payments`) must not allow `status → approved|refunded|paid` outside a SECURITY DEFINER RPC.

Explicit non-changes: no new roles, no new groups, no verb additions beyond `audit.export`, no new scope levels, no new ownership predicates.

---

## 1. Version Register

| Artifact | Version | State |
|---|---|---|
| Authorization Model | **v2.0 RC1** | Release Candidate |
| Permission Catalog | **v2.0 RC1** | Release Candidate |
| Role Registry | **v2.0 RC1** | Release Candidate |
| Scope Model | **v1.0** | Unchanged, reaffirmed |
| Ownership Model | **v1.0** | Unchanged, reaffirmed |
| SECURITY DEFINER Standard | **v1.1** | Minor patch (adds R10 hook; adopts A2 §5.3 self-scope exemption wording). v1.0 substantive rules unchanged. |
| Compliance Framework | **v1.1** | Adds rule R10. R1–R9 unchanged. |
| Naming Standard | **v2.0** | `<group>.<verb>` closed set (view · write · delete · export · read for audit only). |
| Governance / Freeze Policy | **v1.0** | New; established in §7. |

---

## 2. Frozen Role Registry (v2.0 RC1)

Enum `public.app_role`. Six active roles + one deprecated.

| Role | Default grants | Notes |
|---|---|---|
| `admin` | * (all keys, all groups) | Short-circuit via `AuthorizationService.isSuperAdmin()`. |
| `manager` | branch-scoped ops for patients, appointments, invoices, inventory, hr, reports (all `.view` + selected `.write`; no `.delete`, no clinical write). | Approval role for RPC-guarded workflows. |
| `doctor` | clinical write (`medical_records.write/view/export`, `treatment_plans.write/view/export`, `vitals.write/view/export`); `patients.view`; `appointments.write`. | Ownership: row-owning doctor per `SCOPE_OWNERSHIP_MODEL.md`. |
| `nurse` | `patients.view`, `appointments.write`, `medical_records.view`, `vitals.write`, `treatment_plans.view`, `inventory.view`. | Fixes N2 §2.1 orphan; grants land in `role_permissions`. |
| `receptionist` | `patients.write/view`, `appointments.write/view`, `treatment_plans.view`, `invoices.write/view` (create/finalize path only via RPC), `coupons.view`. | Cancels via status update, not `.delete`. |
| `accountant` | finance write across `invoices`, `treasury`, `coupons`; `reports_finance/inventory/operational.view/export`. | Refund path requires manager RPC role-guard. |
| `hr` | `hr.write/view/export`, `reports_hr.view/export`. | KEEP by default. Per-tenant option to merge into `manager` per A1 §2. |
| `staff` *(deprecated)* | `appointments.view` only. | Reassign principals to `receptionist`/`nurse` at cut-over. Enum value retained until principals=0. |

---

## 3. Frozen Permission Catalog (v2.0 RC1)

**Verb set (closed):** `view` · `write` · `delete` · `export` · `read` (audit domain only).
**Wire format:** `<group>.<verb>`. Lowercase, dot-separated, no wildcards.
**Total keys: 55.**

### 3.1 Full catalog

| # | Key | Group | Default risk | Bound roles (default) |
|---|---|---|---|---|
| 1 | `appointments.view` | appointments | low | admin, manager, doctor, nurse, receptionist, accountant, staff |
| 2 | `appointments.write` | appointments | med | admin, manager, doctor, nurse, receptionist |
| 3 | `appointments.delete` | appointments | high | admin |
| 4 | `appointments.export` | appointments | med | admin, manager |
| 5 | `patients.view` | patients | low | admin, manager, doctor, nurse, receptionist, accountant |
| 6 | `patients.write` | patients | med | admin, manager, receptionist |
| 7 | `patients.delete` | patients | high | admin |
| 8 | `patients.export` | patients | high | admin, manager |
| 9 | `medical_records.view` | clinical | low | admin, manager, doctor, nurse |
| 10 | `medical_records.write` | clinical | med | admin, doctor |
| 11 | `medical_records.delete` | clinical | high | admin |
| 12 | `medical_records.export` | clinical | high | admin, doctor |
| 13 | `vitals.view` | clinical | low | admin, manager, doctor, nurse |
| 14 | `vitals.write` | clinical | med | admin, doctor, nurse |
| 15 | `vitals.delete` | clinical | high | admin |
| 16 | `vitals.export` | clinical | med | admin, doctor |
| 17 | `treatment_plans.view` | clinical | low | admin, manager, doctor, nurse, receptionist, accountant |
| 18 | `treatment_plans.write` | clinical | med | admin, doctor |
| 19 | `treatment_plans.delete` | clinical | high | admin |
| 20 | `treatment_plans.export` | clinical | med | admin, doctor |
| 21 | `invoices.view` | finance | low | admin, manager, accountant, receptionist |
| 22 | `invoices.write` | finance | med | admin, accountant, receptionist |
| 23 | `invoices.delete` | finance | high | admin |
| 24 | `invoices.export` | finance | med | admin, manager, accountant |
| 25 | `treasury.view` | finance | low | admin, manager, accountant |
| 26 | `treasury.write` | finance | high | admin, accountant |
| 27 | `treasury.delete` | finance | high | admin |
| 28 | `treasury.export` | finance | med | admin, manager, accountant |
| 29 | `coupons.view` | finance | low | admin, manager, accountant, receptionist |
| 30 | `coupons.write` | finance | med | admin, accountant |
| 31 | `coupons.delete` | finance | high | admin |
| 32 | `coupons.export` | finance | med | admin, accountant |
| 33 | `inventory.view` | inventory | low | admin, manager, accountant, nurse |
| 34 | `inventory.write` | inventory | med | admin, manager |
| 35 | `inventory.delete` | inventory | high | admin |
| 36 | `inventory.export` | inventory | med | admin, manager, accountant |
| 37 | `hr.view` | hr | med | admin, manager, hr |
| 38 | `hr.write` | hr | high | admin, hr |
| 39 | `hr.delete` | hr | high | admin |
| 40 | `hr.export` | hr | high | admin, hr |
| 41 | `settings.view` | settings | low | admin, manager |
| 42 | `settings.write` | settings | high | admin |
| 43 | `settings.delete` | settings | high | admin |
| 44 | `reports_finance.view` | reports | med | admin, manager, accountant |
| 45 | `reports_finance.export` | reports | high | admin, accountant |
| 46 | `reports_medical.view` | reports | med | admin, manager, doctor |
| 47 | `reports_medical.export` | reports | high | admin, doctor |
| 48 | `reports_hr.view` | reports | high | admin, hr |
| 49 | `reports_hr.export` | reports | high | admin, hr |
| 50 | `reports_inventory.view` | reports | low | admin, manager, accountant |
| 51 | `reports_inventory.export` | reports | med | admin, accountant |
| 52 | `reports_operational.view` | reports | low | admin, manager, accountant |
| 53 | `reports_operational.export` | reports | med | admin, manager |
| 54 | `audit.read` | audit | high | admin |
| 55 | `audit.export` | audit | **critical** | admin |

### 3.2 Naming Standard v2.0

1. `<group>.<verb>`, lowercase, dot-separated, ASCII.
2. Verb ∈ `{view, write, delete, export, read}`. `read` is reserved to the `audit` group.
3. `group` = leftmost segment; MUST appear in the frozen group registry: `appointments, patients, clinical, finance, inventory, hr, settings, reports, audit`. (`clinical` covers `medical_records/vitals/treatment_plans`; `finance` covers `invoices/treasury/coupons`.)
4. No wildcards (`*`), no plurals mismatched with group name, no umbrella keys.
5. Deprecations flagged via `deprecated=true` + `replaced_by`; never silently deleted.
6. Any new key requires the freeze-policy gate (§7).

### 3.3 Bundle layer

**Removed.** `role_permissions(role, permission_key)` is the sole source of truth. Tables `authz_bundles`, `authz_bundle_permissions`, `authz_role_bundles`, `authz_bundle_implies` retained for one release cycle (unused), then dropped.

---

## 4. Frozen Scope & Ownership Model (v1.0)

- Helpers preserved: `user_branch_ids()`, `is_admin_or_manager()`, `has_permission()`.
- Scope levels: `global`, `branch`, `self`, `owner`. No additions.
- Ownership predicates: doctor-owns-row for clinical tables; uploader-owns for `patient_documents`; self-owns for attendance/leave/payslip via SECURITY DEFINER RPCs.
- **Self-scope RPC exemption** (from A2 §5.3): documented allowance for `hr.attendance.checkin`, `hr.leave.request`, `payroll.payslip.view_self` and any future self-only surface. Must be a SECURITY DEFINER RPC that authorizes on `subject_id = auth.uid()`.

---

## 5. Frozen Compliance Framework v1.1

Rules R1–R9 unchanged from S2. **New rule R10:**

> **R10 — Approval-workflow integrity.** For tables `expenses`, `purchase_orders`, `leave_requests`, `payroll`, and the refund path on `payments`, no RLS UPDATE policy may permit a transition of the `status` column to any of `{approved, refunded, paid, revert}` unless the update originates from a SECURITY DEFINER RPC in the approved list. Enforcement: static check in `scripts/authz/compliance_definer.py` on the AST of each policy expression + a runtime unit test that asserts direct `UPDATE ... SET status='approved'` fails for non-service roles.

R10 is **advisory** for the RC1 window and flips to **strict** at the end of Wave C, in lockstep with the S2 checker (COMPLIANCE_STRICT=1).

---

## 6. Governance (v1.0)

- **Authoritative documents:** this file (RC1), `SECURITY_DEFINER_STANDARD_V1.md` (patched to v1.1), `S2_COMPLIANCE_FRAMEWORK.md` (v1.1), `SCOPE_OWNERSHIP_MODEL.md`, `RBAC_MATRIX.md` (regenerated), `GOLDEN_AUTHORIZATION_BASELINE.md` (regenerated per wave).
- **Ownership:** Security Lead owns Standard v1.1 and Compliance v1.1; Product Lead owns Permission Catalog v2.0; Platform Lead owns Roles v2.0.
- **Change control:** freeze policy §7.

---

## 7. Freeze Policy (v1.0)

**Effective on RC1 acceptance.** Any change to any of the following requires all four gates below:

- Role registry (add/remove/rename a role)
- Permission catalog (add/remove/rename a key; grant/revoke default binding)
- Scope model, ownership model
- SECURITY DEFINER Standard, Compliance rules R1–R10
- Naming standard

Gates:
1. **Product approval** — written justification with business operation reference.
2. **Security review** — sign-off from Security Lead; red-team check against A2 §5 categories.
3. **Regression harness green** — `scripts/authz/run_all.sh` PASS + Golden Baseline diff matches declared intent.
4. **Documentation update** — this document and any superseded artifact updated in the same PR.

Emergency hotfixes (H-series): follow the H3 pattern (rollback SQL authored first; single SECURITY DEFINER change; harness diff; compliance check). Retroactive freeze-gate review within 5 business days.

---

## 8. Implementation Checklist

Grouped by concern. Item order inside a group is not the execution order; §9 defines waves.

### 8.1 Database (schema + data)
- [ ] Seed `authz_permissions` with the 55 keys from §3.1 (idempotent upsert).
- [ ] Insert `audit.export` key with `risk_level='critical'`.
- [ ] Grant `role_permissions(admin, *)` for all 55 keys.
- [ ] Grant per-role default bindings from §3.1 into `role_permissions`.
- [ ] Insert `role_permissions(admin, 'audit.export')` and `('admin', 'audit.read')`.
- [ ] Mark legacy keys `deprecated=true` + `replaced_by` (write, umbrella, settings.export).
- [ ] Wave C only: delete deprecated `authz_permissions` rows and matching `role_permissions` rows.
- [ ] Wave C only: truncate `authz_bundle_permissions`, `authz_role_bundles`, `authz_bundles`, `authz_bundle_implies`.

### 8.2 RLS
- [ ] Rewrite policy RHS `has_permission(auth.uid(),'x.create'|'x.edit')` → `has_permission(auth.uid(),'x.write')` on every affected table (~15 policies).
- [ ] Rewrite `audit_logs` / `user_activity_logs` policies from `settings.export` → `audit.read` (SELECT) and `audit.export` (bulk export via RPC).
- [ ] Add R10-aligned UPDATE policies: `expenses`, `purchase_orders`, `leave_requests`, `payroll`, `payments` (refund path) exclude direct `status` transitions to `{approved, refunded, paid, revert}` for non-service roles.
- [ ] Add `medical_records` UPDATE policy excluding finalized rows (forces amend RPC — A2 §5.6).
- [ ] Verify branch-scope helpers unchanged.

### 8.3 SECURITY DEFINER (RPCs)
- [ ] Confirm every H3-series function conforms to Standard v1.1 (auto-verified by compliance checker).
- [ ] Add/verify approval RPCs: `approve_purchase_order`, `approve_leave_request`, `approve_expense`, `run_payroll`, `refund_payment` (each uses single `has_permission()` gate + role-guard).
- [ ] Add/verify self-scope RPCs: `checkin_self`, `request_leave_self`, `view_payslip_self`.
- [ ] Add/verify audit-export RPC gated on `audit.export`.
- [ ] Add/verify amend RPC that enforces append-only on finalized records.

### 8.4 Frontend
- [ ] Codemod `<Can perm="x.create|edit">` → `<Can perm="x.write">` across `src/**`.
- [ ] Codemod `useAuthorization().can("x.create|edit")` → `.can("x.write")`.
- [ ] `AuthorizationService` shim (Wave B only): resolves legacy `create/edit` as `write` OR legacy — dual-read. Removed in Wave C.
- [ ] Wire `BackupExport.tsx` to `audit.read` (view) and `audit.export` (download).
- [ ] Wire `AuditLogs.tsx` export button to `audit.export`.
- [ ] Update `moduleForPath()` if any route relied on umbrella `reports` — none currently, verified.

### 8.5 Edge functions
- [ ] Grep `supabase/functions/**` for permission string literals; rewrite legacy keys.
- [ ] Confirm `admin-export` uses `audit.export` gate at RPC layer (not client-supplied claim).
- [ ] `send-reminder`, `detect-queue-alerts`, `enqueue-winback`, `admin-*` — reviewed against Standard v1.1.

### 8.6 Tests
- [ ] Update `AuthorizationService.contract.test.ts` to assert v2 catalog shape.
- [ ] Update `Can.parity.test.tsx` for `write` verb.
- [ ] Regenerate `rbac.spec.ts` and `rbac.deep.spec.ts` fixtures.
- [ ] Add Vitest cases for R10: direct `UPDATE ... SET status='approved'` denied per approval-workflow table.
- [ ] Add Vitest case: finalized `medical_records` UPDATE denied outside amend RPC.

### 8.7 Regression Harness
- [ ] Capture Golden Baseline **v2-wave-a** before Wave A.
- [ ] `scripts/authz/run_all.sh` PASS after each wave.
- [ ] Compliance checker (S2) PASS after each wave; R10 advisory in A/B, strict in C.
- [ ] Baseline diffs reviewed and archived under `docs/wave-a1/`.

### 8.8 Documentation
- [ ] Update `PERMISSION_CATALOG.md` to v2.0 RC1.
- [ ] Update `ROLE_ARCHITECTURE.md` to v2.0 RC1.
- [ ] Update `RBAC_MATRIX.md` (regenerate from `role_permissions`).
- [ ] Patch `SECURITY_DEFINER_STANDARD_V1.md` → v1.1 (auth-null message, self-scope exemption, R10 hook).
- [ ] Patch `S2_COMPLIANCE_FRAMEWORK.md` → v1.1 (add R10).
- [ ] Update `SCOPE_OWNERSHIP_MODEL.md` (codify self-scope RPC exemption).
- [ ] Archive superseded documents per §10.

---

## 9. Implementation Order (Waves A → B → C)

Each wave has an explicit rollback point. No wave proceeds if the harness or compliance checker regresses.

### Wave A — Additive
Duration ~0.5 day. Zero cutover risk.
1. Insert 11 `x.write` keys.
2. Insert `audit.read` and `audit.export` keys.
3. Backfill `role_permissions` with `write` + audit grants for every role that currently holds create/edit or the audit-repointed grant.
4. Capture Golden Baseline **v2-wave-a**.

**Rollback A:** `DELETE FROM role_permissions WHERE permission_key IN (…new keys)`; `DELETE FROM authz_permissions WHERE key IN (…new keys)`. RTO < 5 min.

### Wave B — Cutover
Duration ~1.5 days. Behavior-preserving.
1. Rewrite RLS policies (create/edit → write; settings.export → audit.read/audit.export).
2. Deploy R10-aligned UPDATE policies for approval-workflow tables (advisory).
3. Deploy `medical_records` finalized-row UPDATE policy.
4. Frontend codemod merged; `AuthorizationService` shim ON.
5. Edge-function audit merged.
6. New/verified RPCs deployed (approval, self-scope, audit-export, amend).
7. Full test suite + Playwright RBAC + harness PASS. Baseline **v2-wave-b**.

**Rollback B:** revert policy DDL from wave-start snapshot; toggle shim off; git-revert codemod. RTO < 15 min.

### Wave C — Hygiene & Freeze
Duration ~1 day. One-way.
1. Delete legacy `x.create` / `x.edit`, umbrella `reports.view`/`reports.export`, and `settings.export` rows.
2. Truncate the four bundle tables.
3. Remove `AuthorizationService` shim.
4. Reassign remaining `staff` principals to `receptionist`/`nurse`; queue `staff` enum-value drop.
5. Flip Compliance R10 → strict; flip `COMPLIANCE_STRICT=1`.
6. Regenerate `RBAC_MATRIX.md`; capture Golden Baseline **v2-final**.
7. Publish v2.0 GA (drops the RC1 suffix).

**Rollback C:** re-insert legacy rows from Wave A snapshot (kept as `authz_permissions_pre_v2` for one release); recreate bundle tables from pre-C `pg_dump`. RTO < 30 min.

---

## 10. Document Lifecycle Under RC1

| Document | Post-RC1 state | Notes |
|---|---|---|
| `docs/governance/A3_AUTHORIZATION_V2_RC1.md` | **ACTIVE (authoritative)** | This document. |
| `docs/PERMISSION_CATALOG.md` | ACTIVE (regenerated to v2.0 RC1) | Match §3.1. |
| `docs/ROLE_ARCHITECTURE.md` | ACTIVE (regenerated to v2.0 RC1) | Match §2. |
| `docs/RBAC_MATRIX.md` | ACTIVE (regenerated at end of Wave C) | Derived from `role_permissions`. |
| `docs/SCOPE_OWNERSHIP_MODEL.md` | ACTIVE (patched with self-scope exemption) | v1.0 unchanged otherwise. |
| `docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md` | ACTIVE (patched to v1.1) | Substantive rules preserved. |
| `docs/security/S2_COMPLIANCE_FRAMEWORK.md` | ACTIVE (patched to v1.1) | Adds R10. |
| `docs/security/S2_COMPLIANCE_REPORT.md` | ACTIVE (regenerated per wave) | Snapshot artifact. |
| `docs/GOLDEN_AUTHORIZATION_BASELINE.md` | ACTIVE (regenerated per wave) | Baseline of record. |
| `docs/BUSINESS_OPERATIONS_CATALOG.md` | ACTIVE | Business source; unchanged. |
| `docs/governance/A0_COMPLEXITY_REVIEW.md` | ARCHIVED (historical) | Basis for A1; frozen. |
| `docs/governance/A1_SIMPLIFICATION_PLAN.md` | ARCHIVED (historical) | Superseded by A3. |
| `docs/governance/A2_BUSINESS_VALIDATION.md` | ARCHIVED (historical) | Deltas incorporated into A3. |
| `docs/normalization/N1_…` through `N9_…` | ARCHIVED | Basis of A0/A1; retained for provenance. |
| `docs/wave3*/**`, `docs/wave3a/**`, `docs/wave3b/**`, `docs/wave3c/**`, `docs/wave3d/**`, `docs/wave3e/**` | ARCHIVED | Pre-v2 migration work; retained as history. |
| `docs/AUTHORIZATION_INVENTORY.md` | DEPRECATED (regenerate or delete post-Wave-C) | Superseded by `RBAC_MATRIX.md` v2 + compliance report. |
| `docs/AUTHORIZATION_REGRESSION_HARNESS.md` | ACTIVE (updated with R10 note) | Operational doc. |
| `docs/BACKEND_AUTHORIZATION_MIGRATION_PLAN.md` | DEPRECATED | Superseded by §8/§9. |
| `docs/security/H3_*` hotfix docs | ACTIVE (historical implementation reference) | Kept as pattern precedent for future H-series. |
| `docs/security/S1_5_CONFORMANCE_AUDIT.md` | ACTIVE (informs v1.1 patch) | Frozen. |
| `docs/SPRINT1_BATCH2A_DECLARATIVE_WRAPPERS.md` | ARCHIVED | Pre-v2 sprint doc. |
| `docs/governance/CHARTER.md`, `LIFECYCLE_POLICY.md`, `OWNERSHIP_MATRIX.md`, `IMPLEMENTATION_PRIORITY.md`, `PERMISSION_STATUS_REGISTER.md`, `PRODUCT_DECISIONS.md` | ACTIVE (align to freeze policy §7) | Update references to v2.0 RC1. |

Any document not listed here remains in its current state.

---

## 11. Acceptance Criteria for RC1 → GA

RC1 becomes GA (`v2.0`) when **all** of the following are true after Wave C:

- Golden Baseline `v2-final` diff matches declared intent from §9 exactly.
- `scripts/authz/run_all.sh` PASS with `COMPLIANCE_STRICT=1`.
- All 55 keys present in `authz_permissions`; all deprecated keys removed.
- Bundle tables empty; `role_permissions` is the sole grant source.
- Frontend codemod merged; shim removed; no legacy key literal remains in `src/**` or `supabase/functions/**`.
- `RBAC_MATRIX.md`, `PERMISSION_CATALOG.md`, `ROLE_ARCHITECTURE.md` regenerated and reviewed.
- Freeze policy §7 in force in the repository CODEOWNERS.

---

**End of A3 Release Candidate specification. No implementation performed in this sprint.**
