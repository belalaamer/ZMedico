# R5 Pre-Flight — Implementation Impact Analysis

**Input:** `docs/business/FINAL_PERMISSION_SPECIFICATION.md` (frozen, 188 keys — spec header still says 118; see readiness validation B-1).
**Objective:** Guarantee exactly one authoritative authorization decision per business operation before R5 starts.
**Scope:** Enforcement layer mapping only. No permission renaming, no new permissions, no governance narrative.

Layer legend: **FE** frontend gate (`<Can>` / `useAuthorization`) · **RLS** row-level policy · **RPC** `SECURITY DEFINER` function · **EF** edge function · **TRG** database trigger (state / audit / SoD) · **JOB** background job.

Enforcement rule applied throughout: **FE is advisory only.** The authoritative decision must live server-side. Every write must be reachable through exactly one server-side path (RLS *or* RPC — never both making the same decision).

---

## 1. Coverage Matrix (by module, all 188 keys)

For each module the table gives: number of keys · authoritative server layer · mandatory supporting layers · notes.

| § | Module | Keys | Authoritative | Supporting | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Patients | 9 | RLS for reads + demographics; RPC for `merge`, `archive`, `delete.hard`, `phi.view.crossbranch`, `export` | TRG (audit imm on merge/archive/delete/BG); FE gate | `phi.view` enforced by RLS on assignment join. |
| 2 | Appointments | 9 | RLS for CRUD; RPC for `status.transition`, `override.doublebook`, `cancel.late_fee_waive`, `crossbranch.view`, `export` | TRG (state machine); FE | State machine (§2) MUST live in trigger, not RLS. |
| 3 | Medical Records | 8 | RPC for every write (`create`, `amend`, `correct.late`, `sign`, `unlock`, `export`); RLS for reads (`view`, `view.breakglass`) | TRG (imm audit, addendum-only after 24h, sign = terminal); FE | Hard-delete forbidden — enforced by absence of DELETE policy AND revoked table privilege. |
| 5 | Laboratory | 9 | RLS for reads; RPC for `result.enter`, `result.validate`, `result.release`, `result.amend`, `critical.notify` | TRG (validated-before-release; ack tracking); FE | `order.create/cancel` = RLS. |
| 6 | Radiology | 7 | RLS for reads; RPC for `order.dual`, `report.sign`, `export` | TRG (sign = terminal; contrast → dual); FE | `image.view` crossbranch = RPC gated by BG. |
| 7 | Pharmacy | 6 | RPC for every mutation (`dispense`, `controlled.dispense`, `substitute`, `return`, `stock.adjust`) | TRG (SoD: prescriber≠dispenser; imm audit); FE | `view` = RLS. |
| 8 | Dental | 3 | RLS for `chart.update`, `treatment_plan.create`; RPC for `treatment_plan.approve.financial` | TRG (financial approver ≠ author); FE | Chart under `medical_records` audit umbrella. |
| 9 | Physio | 4 | RPC for `session.log`, `plan.amend`, `discharge`; RLS for `case.open` | TRG (imm after sign; dual for injury discharge); FE | 24h window enforced by TRG (states), not scope. |
| 10 | Procedures | 5 | RPC for `perform`, `high_risk.perform`, `abort`; RLS for `schedule`, `consent.capture` | TRG (consent + checklist precondition); FE | `high_risk` dual enforced by TRG, not RLS. |
| 11 | Prescriptions | 6 | RPC for `create`, `controlled.create`, `amend`, `cancel`, `refill.authorize`; RLS for `view` | TRG (immutable after dispense; addendum after 24h); FE | Controlled = dual verified in RPC. |
| 12 | Inventory | 8 | RLS for `item.create/update`, `stock.receive`, `view`; RPC for `stock.adjust`, `stock.transfer`, `write_off`, `export` | TRG (variance thresholds → escalate); FE | Cost-field visibility handled by column privileges + RLS. |
| 13 | Purchase Orders | 7 | RPC for every mutation (`draft`, `submit`, `approve.tier1`, `approve.tier2`, `receive`, `close`, `cancel`) | TRG (SoD: creator≠approver≠receiver; 3-way match); FE | Tier2 dual verified in RPC. |
| 14 | Suppliers | 4 | RPC for `create`, `bank.update`, `contract.attach`; RLS for `view` | TRG (bank change requires callback flag); FE | `bank.update` = dual (callback evidence attached). |
| 15 | Treasury | 6 | RPC for `shift.open/close`, `transfer`, `adjust`, `export`; RLS for `view` (own/branch predicate) | TRG (one open shift per till; SoD: cashier≠adjuster; imm audit); FE | `view` scope ambiguity (spec I-9) resolved in RLS predicate. |
| 16 | Wallet | 5 | RPC for `topup`, `refund`, `adjust.manual`, `statement.export`; RLS for `view` | TRG (refund threshold → org_admin; imm audit); FE | Refund dual enforced in RPC. |
| 17 | Payments | 7 | RPC for every mutation (`record.cash`, `record.card`, `record.transfer`, `void`, `refund`, `reallocate`); RLS for `view` | TRG (shift binding; same-day void window; imm audit); FE | SoD: invoice creator ≠ collector above threshold — TRG. |
| 18 | Insurance | 6 | RPC for `claim.submit`, `contract.manage`, `writeoff`; RLS for `eligibility.check`, `claim.create`, `claim.appeal` | TRG (writeoff threshold escalation; imm audit); FE | Contract change = dual in RPC. |
| 19 | Invoices | 10 | RPC for `finalize`, `discount.apply.tier1..3`, `void`, `credit_note`, `reissue`, `export`; RLS for `draft`, `view` | TRG (finalize=terminal; SoD creator≠collector; imm audit); FE | Three discount tiers all RPC; RLS insufficient for threshold math. |
| 20 | HR | 7 | RPC for `staff.create`, `staff.terminate`, `roles.assign`, `credentials.verify`, `contract.manage`; RLS for `staff.update.profile` (self+field-scoped), `view.sensitive` | TRG (SoD guard on `roles.assign` — toxic pairs §0; termination cascade); FE | Field-scoped self-update enforced by column-list check in RPC (spec I-10). |
| 21 | Payroll | 6 | RPC for `run.calculate`, `run.approve`, `run.disburse`, `adjust.oneoff`; RLS for `view.own`, `view.all` | TRG (approve→disburse ordering; SoD payroll≠accountant on disburse; imm audit); FE | Negative-org_admin note handled by non-assignment (spec B-6). |
| 22 | Attendance | 5 | RPC for `correct`, `override`, `export`; RLS for `punch` (self), `view.team` | TRG (geo/biometric on punch; override → payroll flag); FE | Override = dual in RPC. |
| 23 | Leave | 5 | RPC for `approve.tier1`, `approve.tier2`, `balance.adjust`; RLS for `request`, `cancel` | TRG (balance debit on approve; cancel-after-start blocked); FE | Tier2 dual verified in RPC. |
| 24 | Performance | 5 | RPC for `review.sign`, `bonus.recommend`, `bonus.approve`; RLS for `review.draft`, `view.own` | TRG (reviewee-ack required; pay linkage on approve); FE | Bonus approve = dual. |
| 25 | Documents | 5 | RPC for `delete`, `export`; RLS for `upload.clinical`, `upload.admin`, `view.clinical` | TRG (soft-delete by default; watermark log; imm audit); FE | Hard-delete only via org_admin RPC path. |
| 26 | Comms | 5 | RPC for `template.manage`, `broadcast.patient`, `optout.override`; RLS for `send.transactional`, `log.view` | TRG (consent filter on broadcast; opt-out override = BG); FE | Rate-limit is JOB, not authz. |
| 27 | Reports | 11 | RLS for `*.view`; RPC for `*.export`, `crossbranch.view` | TRG (export watermark + log); FE | Patient-level clinical read → phi audit trigger. |
| 28 | Audit | 4 | RPC for `log.export`, `breakglass.review`, `sod.violations.view`; RLS for `log.view` | TRG (append-only enforced by REVOKE UPDATE/DELETE on audit table); FE | No role can write audit rows through any path. |
| 29 | Administration | 5 | RPC for `branch.create`, `branch.close`, `feature_flag.toggle`, `impersonate`; RLS for `branch.update` | TRG (impersonation time-box, auditor notify); FE | `impersonate` = BG only. |
| 30 | Security | 6 | RPC for every operation (`role.define`, `permission.define`, `bundle.assign`, `session.revoke`, `mfa.reset`, `breakglass.grant`) | TRG (SoD guard on `bundle.assign`; BG auto-revoke JOB); FE | Registry mutations are dual. |
| 31 | Settings | 5 | RPC for `org.update`, `pricing.update`, `catalog.update`, `integrations.manage`; RLS for `branch.update` (non-financial fields) | TRG (financial fields → route to accountant RPC — spec I-11); FE | Integrations excludes secrets. |

**Total accounted for: 188/188.** No key is unmapped to a layer.

Background jobs (JOB) with authorization side-effects (all use `service_role`; no user-facing decision):
- BG auto-revoke (`security.breakglass.grant`).
- Weekly BG review escalation (`audit.breakglass.review`).
- License-expiry sweeper toggling clinical `perform`/`sign` eligibility (§33.7).
- Comms rate-limiter (advisory only).

---

## 2. Missing Enforcement

Every gap below MUST be closed inside its R5 batch — none block the sequencing itself.

| # | Key(s) | Missing layer | Reason |
| --- | --- | --- | --- |
| M-1 | `appointments.status.transition` | TRG (state machine) | Spec §2 lists the FSM in prose only; no per-transition guard exists yet. Without TRG, an authorized user can drive an illegal edge. |
| M-2 | `medical_records.amend`, `physio.plan.amend`, `prescriptions.amend` | TRG (24h window) | The time bound was hidden in `scope=own+24h`; readiness B-2 moves it to `states`. TRG must materialize the window. |
| M-3 | `pharmacy.controlled.dispense`, `prescriptions.controlled.create`, `procedures.high_risk.perform`, `radiology.order.dual` | RPC (dual verification) | Second-actor verification cannot live in RLS; requires request-level RPC that binds two authenticated actors. |
| M-4 | `treasury.adjust`, `wallet.refund`, `wallet.adjust.manual`, `payments.void`, `payments.refund`, `invoices.void`, `invoices.discount.apply.tier2/3` | TRG (SoD: actor A ≠ actor B) | Dual approvals require server-side non-equality check; RPC verifies presence, TRG enforces distinctness. |
| M-5 | `hr.roles.assign`, `security.bundle.assign` | TRG (SoD toxic-pair guard) | §33.6 is not enforceable at the RPC layer alone if roles can be assigned by other paths; TRG on `user_roles` / `staff_bundles` closes it. |
| M-6 | `payments.record.cash` | TRG (shift binding) | Must be rejected when caller has no open shift. |
| M-7 | `documents.delete` (hard path) | RPC + TRG | Hard-delete must be a dedicated RPC; RLS DELETE policy must be absent. |
| M-8 | `audit.log.*` | Table-privilege REVOKE | Append-only property currently relies on RLS only; must also `REVOKE UPDATE, DELETE` from every role. |
| M-9 | All `*.export` keys | TRG (export log + watermark) | Export requires an audit row per artifact; not enforceable in FE or RLS alone. |
| M-10 | `admin.impersonate`, `patients.phi.view.crossbranch`, `medical_records.view.breakglass`, `comms.optout.override` | JOB (time-box expiry) | BG grants must auto-expire; absent this, "time-boxed" is honor-system. |

No permission is entirely un-enforced. Every gap above has an owner batch in `docs/R5_EXECUTION_PLAN.md`.

---

## 3. Duplicate Enforcement

The following overlaps would result in **two authoritative decisions** for the same operation and must be collapsed to one before its batch merges.

| # | Overlap | Resolution |
| --- | --- | --- |
| D-1 | `medical_records.create` currently reachable via both a permissive RLS INSERT policy AND the future `rpc_create_medical_record`. | Remove RLS INSERT; RPC is authoritative. |
| D-2 | `payments.record.*` — RLS INSERT policy exists today AND an RPC will be introduced. | Same: RLS INSERT removed in payments batch. |
| D-3 | `invoices.finalize` — status update is currently a plain UPDATE governed by RLS; will move to RPC. | Drop UPDATE policy on `status` column; RPC only. |
| D-4 | `inventory.stock.adjust` and `pharmacy.stock.adjust` (spec I-13) — same underlying row could be mutated by two RPCs. | Pharmacy RPC delegates to inventory RPC; no direct table write from pharmacy path. |
| D-5 | `treasury.transfer` — currently a client-side two-row insert under RLS; RPC will wrap. | Remove client-side insert path; RPC only. |
| D-6 | `hr.roles.assign` — direct INSERT on `user_roles` currently allowed to admin via RLS AND SoD guard will move to TRG. | Keep TRG (authoritative for SoD); narrow RLS INSERT to `service_role` so only the RPC path reaches it. |

No FE-vs-server "duplicate" is listed — FE gates are advisory by design and never authoritative.

---

## 4. Server-side Gaps

Every write operation must have a server-side check. The following are the only writes not currently protected server-side and must be closed in their batch:

| # | Operation | Currently | Required |
| --- | --- | --- | --- |
| S-1 | `patients.clinical_flags.update` | RLS UPDATE covers whole row | Column-scoped UPDATE policy OR dedicated RPC — front-desk role must not reach clinical flag columns. |
| S-2 | `hr.staff.update.profile` (self path) | Client trusted to send limited-field payload | RPC with explicit allow-list of self-editable columns. |
| S-3 | `settings.branch.update` (financial fields) | Single UPDATE policy | Split into non-financial (RLS) and financial (RPC → accountant). |
| S-4 | `comms.broadcast.patient` | INSERT into outbox trusted | RPC enforces consent filter at commit time. |
| S-5 | `attendance.punch` | Client sends geo | RPC verifies geo/biometric server-side. |
| S-6 | `documents.upload.clinical` (assignment scope) | RLS on documents table only | Storage-layer policy must mirror the assignment predicate. |

All other 182 keys already have (or will have, per §1) a server-authoritative layer.

---

## 5. Approval Gaps

Every approval mode must be non-bypassable. An approval is bypassable if any execution path can commit the underlying row without invoking the approval check.

| # | Key | Bypass risk | Close |
| --- | --- | --- | --- |
| A-1 | `invoices.discount.apply.tier2/3` | Discount could be applied via generic invoice UPDATE. | Discount fields become RPC-only; RLS UPDATE excludes them. |
| A-2 | `payroll.run.disburse` | Disburse row insertable directly if RLS INSERT open. | RPC-only; RLS INSERT closed to `authenticated`. |
| A-3 | `pharmacy.controlled.dispense` | Regular `pharmacy.dispense` RPC could be called with a controlled item. | RPC checks item class and rejects → forces dual path. |
| A-4 | `patients.delete.hard` | Any admin with generic DELETE could bypass. | No DELETE policy on `patients`; RPC-only with BG. |
| A-5 | `hr.roles.assign` | Direct INSERT into `user_roles`. | RLS INSERT restricted to `service_role`; RPC is sole entry. |
| A-6 | `security.bundle.assign` | Direct INSERT into `staff_bundles`. | Same treatment as A-5. |
| A-7 | `treasury.transfer`, `treasury.adjust` | Two-row insert bypasses dual check. | RPC issues both rows in one transaction and verifies second actor. |
| A-8 | `performance.review.sign` | Sign flag settable via UPDATE. | RPC-only; UPDATE policy excludes `signed_at` / `signed_by`. |
| A-9 | `invoices.void` after same-day window | Same-day check lives in RPC only; direct UPDATE could bypass. | TRG re-checks the same-day window on status change. |
| A-10 | `wallet.refund` above threshold | Threshold check in RPC only. | TRG re-checks the escalation threshold. |

Rule to apply universally in R5: **for every RPC-enforced approval, the same invariant is re-asserted in a TRG.** RPC is the entry point; TRG is the last line of defence.

---

## 6. Audit Gaps

Every destructive or dual/BG operation must land in the immutable audit stream.

| # | Key(s) | Gap | Close |
| --- | --- | --- | --- |
| U-1 | `documents.delete` (soft) | Currently logs to standard audit only. | Route through immutable audit table. |
| U-2 | `appointments.cancel.soft` | No audit today. | Standard audit sufficient; add row. |
| U-3 | `inventory.write_off`, `pharmacy.return` | Audit inserted from client. | Move audit insert into TRG. |
| U-4 | `admin.impersonate` | Session start logged; session end not. | TRG on session-revoke path writes end row; JOB writes forced-expiry row. |
| U-5 | Every `*.export` | Watermark generated but not linked to audit. | TRG on export table writes immutable row containing artifact hash. |
| U-6 | `security.breakglass.grant` and every BG *use* | Grant is audited; each use of the grant is not linked back. | RPC that consumes a BG grant writes an audit row referencing the grant id. |
| U-7 | `payroll.run.disburse` | Payment-side audit exists; payroll-side audit missing. | TRG on `payroll_runs` writes immutable row on status = disbursed. |

Audit for the remaining 174 keys is either already in place or covered by the module-wide TRG pattern established for that module.

---

## 7. AUTHZ ∧ STATE Split

Verified: for every state-guarded key, the AUTHZ check (permission held?) and the STATE check (entity in an allowed state?) are enforced in **separate** predicates, so a permission grant never implicitly grants a state override.

| Module | AUTHZ layer | STATE layer |
| --- | --- | --- |
| Appointments | RLS / RPC | TRG (FSM) |
| Medical Records | RPC | TRG (sign=terminal; 24h addendum) |
| Invoices | RPC | TRG (finalize=terminal; same-day void) |
| Prescriptions | RPC | TRG (dispensed=terminal) |
| Physio | RPC | TRG (sign=terminal) |
| Lab | RPC | TRG (validated-before-release) |
| Radiology | RPC | TRG (sign=terminal) |
| Payments | RPC | TRG (same-day void; shift binding) |
| Payroll | RPC | TRG (calculate→approve→disburse ordering) |
| Attendance | RPC | TRG (open-shift binding) |
| Leave | RPC | TRG (start-date guard) |

No key currently collapses AUTHZ and STATE into a single check. No remediation required beyond materializing the triggers listed in §2 (M-1).

---

## 8. Operation ↔ Permission Bijection

- **Every permission maps to ≥ 1 executable operation.** Sweep of §1–§31 confirms each of the 188 keys is the sole authorization for a concrete UI/API/RPC surface. Reference: registry §34 cross-referenced against R5 execution plan batches.
- **Every executable operation maps to a permission.** Sweep of existing RPCs / write endpoints against the registry shows no orphaned mutation surface after the pre-R5 audit removed the last three legacy `*.edit` catch-alls (spec §32).
- Exceptions (all intentional, all authorized by `service_role` only, never callable from a user session): trigger internals, JOB workers, and the seed migration for `permissions`/`role_bundles` itself.

---

## 9. Final Go / No-Go

**GO for R5, conditional on the four hard preconditions below being applied inside each affected batch (not as separate work):**

1. **Duplicate collapse (D-1..D-6)** — every batch removes the legacy RLS write policy in the same migration that introduces the RPC. No batch may ship an RPC without closing its RLS counterpart.
2. **Server-side gap closure (S-1..S-6)** — the six writes above become RPC-authoritative in their owning batch.
3. **Approval non-bypass (A-1..A-10)** — every RPC-enforced approval is mirrored by a TRG invariant in the same migration.
4. **Immutable audit (U-1..U-7)** — every destructive / dual / BG operation writes to the append-only audit stream from within a TRG.

Sequencing is unchanged from `docs/R5_EXECUTION_PLAN.md`. Batch 1 may start when the readiness-validation blockers (B-1..B-6) are patched into the frozen spec.

**Any batch merging without its slice of §2 / §3 / §4 / §5 / §6 remediation applied is a No-Go for that batch.**
