# Final Permission Specification — Implementation Readiness Validation

**Input:** `docs/business/FINAL_PERMISSION_SPECIFICATION.md` (frozen).
**Purpose:** Confirm that the specification is internally consistent and can be implemented exactly as written by R5 batches, the `permissions` registry, `role_bundles`, `has_permission()`, RLS, SECURITY DEFINER RPCs, and the frontend gate — without special-case logic.
**Method:** Line-by-line audit of §0–§35. No redesign. No new permissions proposed except where an implementation blocker forces one.

---

## 1. Coverage Summary

| Check | Result |
| --- | --- |
| Unique, stable permission key per entry | PASS — zero duplicates in the flat registry (§34). |
| Belongs to exactly one permission group | PASS (implicit) — every key has a single `<domain>` prefix that unambiguously groups it. Group field is not declared as a first-class column (see NB-1). |
| Scope value drawn from defined enum | **FAIL** — three composite scope values (`own+24h`) leak a time guard into the scope column. See B-2. |
| Approval value drawn from defined enum | **FAIL** — composite values `dual+BG`, `dual+SoD` used in three rows. See B-3. |
| Audit value drawn from defined enum | PASS — every populated audit cell is `std`, `imm`, `phi`, or a `phi+imm` union that maps cleanly onto `{standard, immutable, phi_access}`. |
| No duplicate permissions | PASS — 188 distinct keys, no repeats. |
| No overlapping permissions | PASS with 2 advisory overlaps (NB-3). |
| No unreachable permissions | PASS — every key appears in at least one role's P/A/R/V/X column across §1–§31. |
| Every permission assignable through a bundle | PASS — derivable from the P/A/R/V/X matrix. |
| Every permission enforceable by `has_permission()` | PASS conditional on B-2/B-3 being resolved into pure scalar metadata. |
| Representable in RLS + RPCs + frontend without special-case logic | **FAIL** on the composite metadata rows (B-2, B-3, B-6) and the wildcard SoD pair (B-4). |

**Registry count reconciliation:** §34 states *"118 permissions total"*. Machine count of the fenced list is **188**. The list itself has no duplicates — the header is the incorrect number. See B-1.

---

## 2. Inconsistency Table

| # | Location | Observation | Type |
| --- | --- | --- | --- |
| I-1 | §34 header | Claims 118 permissions; list contains 188. | Documentation error |
| I-2 | §3, §9, §11 | `scope = own+24h` used on `medical_records.amend`, `physio.plan.amend`, `prescriptions.amend`. Composite of scope + time-state. | Enum violation |
| I-3 | §1, §3 | `approval = dual+BG` on `patients.delete.hard`, `medical_records.unlock`. Composite of two enum values. | Enum violation |
| I-4 | §20 | `approval = dual+SoD` on `hr.roles.assign`. `SoD` is a cross-cutting rule (§33.6), not an approval mode. | Enum violation |
| I-5 | §0 | Toxic pair `auditor+*write*` uses a wildcard; SoD guard needs a concrete role set. | Non-enumerable rule |
| I-6 | §5 | Performer `senior lab_tech` referenced but role taxonomy has only `lab_tech`. | Undeclared role |
| I-7 | §6 | Performer `radiologist tech` referenced but taxonomy has only `radiologist`. | Undeclared role |
| I-8 | §21 | `payroll.view.all` note "org_admin excluded unless BG". Additive bundle model has no deny primitive. | Negative constraint |
| I-9 | §15 | `treasury.view` performer note `cashier(own), acct(all)` implies two scopes for one permission key. | Scope ambiguity |
| I-10 | §20 | `hr.staff.update.profile` performed by `hr_officer` OR `self(own)` on limited fields — mixes actor scope with field scope. | Scope/field ambiguity |
| I-11 | §31 | `settings.branch.update` note "financial fields → accountant" — field-conditional performer without a dedicated key. | Field ambiguity |
| I-12 | §2 | `appointments.status.transition` is a single key covering every legal edge; allowed edges live in §2's state-machine prose, not in permission metadata. | Under-specified state list |
| I-13 | §7 vs §12 | `pharmacy.stock.adjust` and `inventory.stock.adjust` are semantically parallel. Both are enumerated. | Advisory overlap |
| I-14 | §18 vs §19 | `insurance.writeoff` vs `invoices.credit_note` overlap for insurance-driven write-downs. | Advisory overlap |
| I-15 | §0 vs review criteria | Scope enum uses `{global, branch, own, assigned, emergency}`; validation vocabulary uses `{self, branch, organization, global}`. Trivially mappable (`self=own`, `organization=global`) but the two words are not equated in the spec. | Vocabulary drift |
| I-16 | §34 | Group column absent from the registry — group must be inferred from the domain prefix. | Missing first-class field |

---

## 3. Blocking Issues

All blockers are documentation-level (metadata fields), not business-model changes. Each is resolvable without redesign.

| # | Blocker | Why it blocks R5 | Required fix (no redesign) |
| --- | --- | --- | --- |
| **B-1** | Registry count mismatch (118 vs 188) | Seeder & governance sign-off pivot on the declared count; a wrong header will fail the "Authorization Contract" reconciliation gate. | Correct §34 header to `188`. |
| **B-2** | `own+24h` is not a valid `scope` value | Resolver expects a scalar scope; `has_permission()` cannot dispatch on a composite. RLS cannot express a time bound via scope. | Set `scope = own` on the three rows and move the 24h window into `states` (e.g. `states = [within_24h_of_authorship]`), consistent with §33.10. |
| **B-3** | `dual+BG` / `dual+SoD` composite approvals | The approval enum has four scalar values (`none, single, dual, break_glass`). Composite values require special-case runtime logic. | Set `approval = break_glass` on the two `dual+BG` rows (BG already implies the second actor); set `approval = dual` on `hr.roles.assign` — SoD is enforced by rule §33.6 regardless of the approval mode. |
| **B-4** | Toxic pair `auditor+*write*` uses a wildcard | The SoD guard runs pre-commit against a fixed set of role pairs. A wildcard cannot be enforced generically without inspecting every bundle at assignment time. | Replace with the enumerated concrete pairs `auditor+{doctor, dentist, physiotherapist, nurse, pharmacist, lab_tech, radiologist, receptionist, billing_specialist, cashier, accountant, hr_officer, payroll_officer, branch_manager, org_admin, super_admin}`. No new permissions; only §0 restated. |
| **B-5** | Undeclared performer roles (`senior lab_tech`, `radiologist tech`) | Any bundle referencing these will fail to resolve — no matching row in `roles`. | Restate as base roles: `senior lab_tech` → `lab_tech` (validation gated by `hr.credentials.verify` seniority attribute); `radiologist tech` → `radiologist`. No taxonomy change. |
| **B-6** | Negative constraint on `payroll.view.all` for `org_admin` | Additive bundles cannot express "everyone with X except role Y". Frontend & RLS would need bespoke logic. | Reword the note: `org_admin` is simply *not assigned* the `payroll.view.all` permission; access via `admin.impersonate` (already in §29) covers the BG path. No new permissions. |

---

## 4. Non-Blocking Improvements

| # | Improvement |
| --- | --- |
| NB-1 | Promote `group` to a first-class registry column derived from the domain prefix — enables catalog UI and coverage reports without prefix parsing. |
| NB-2 | Align scope vocabulary with the review criteria: publish `self ↔ own` and `organization ↔ global` as synonyms in §0 to prevent future confusion. |
| NB-3 | Add a "See also" cross-reference between `pharmacy.stock.adjust`/`inventory.stock.adjust` and between `insurance.writeoff`/`invoices.credit_note` clarifying which key authoritatively covers which flow — no behavior change. |
| NB-4 | Enumerate legal state transitions per key that currently list "state-guarded" — makes I-12 machine-checkable. |
| NB-5 | Formalise `phi+imm` as a first-class audit value (`phi_access_immutable`) so audit dispatch stays scalar. |
| NB-6 | Add a `min_actors` derived column to the registry (`none→1, single→2, dual→2, break_glass→2`) so approval enforcement is a table lookup, not a switch. |
| NB-7 | Split `treasury.view` into `treasury.view.own` (cashier, `scope=own`) and `treasury.view.branch` (accountant, `scope=branch`). Purely a keying fix for I-9; kept as NB because R5 can encode this in RLS predicates today. |

---

## 5. Reachability & Bundle Assignability

- Every key in §34 is referenced by at least one column in §1–§31. **No orphan permissions.**
- Every key has at least one performer role in the taxonomy (once B-5 is applied). **No unreachable-by-bundle permissions.**
- Every key's approval, scope, and audit metadata (once B-2/B-3 are applied) is composed of scalar enum values. `has_permission(user, key)` can therefore return a boolean without consulting per-key custom code — the (approval, scope, states) triple is enforced by the same generic wrapper for every key.
- No key requires deny semantics after B-6.

---

## 6. Verdict

**READY WITH MINOR FIXES.**

Rationale:

- The business model itself — 188 permissions across 31 modules, 18 roles, 7 toxic pairs, four cross-cutting rule families — is internally coherent and expressible in the additive bundle + RLS + SECURITY DEFINER RPC stack already in place.
- All six blockers (B-1..B-6) are metadata / wording fixes inside `FINAL_PERMISSION_SPECIFICATION.md`. None require redesigning a role, splitting or merging a permission, or altering an SoD rule.
- Once B-1..B-6 are patched into the frozen document (a mechanical edit, not an amendment to the business decisions), R5 batches can proceed exactly as sequenced in `docs/R5_EXECUTION_PLAN.md`.
- Non-blocking improvements (NB-1..NB-7) may be scheduled after R5 completes; none of them gate a batch.

**Go/No-Go for R5 Batch 1:** No-Go until B-1..B-6 are corrected in the specification. Once corrected, Go.
