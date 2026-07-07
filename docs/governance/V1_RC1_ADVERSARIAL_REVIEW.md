# V1 — Authorization v2 RC1 Adversarial Review

**Status:** Documentation only. Independent red-team.
**Stance:** Prosecutorial. The reviewer's brief is to **reject** RC1 if possible; prior conclusions (A0–A3) are treated as claims, not facts.
**Scope of attack surface:** roles, permissions, scopes, ownership, compliance R1–R10, governance, freeze policy, business coverage, RPC/edge/SECURITY DEFINER paths.

---

## 0. Method

1. Re-derived the RC1 catalog from `A3_AUTHORIZATION_V2_RC1.md` §2–§3 without trusting A2's coverage claim.
2. For each of the 14 principal scenarios and 16 abuse targets, constructed the shortest attack chain permitted by the RC1 catalog + preserved helpers (`has_permission`, `user_branch_ids`, `is_admin_or_manager`).
3. Cross-checked against the live schema (135 operations from `BUSINESS_OPERATIONS_CATALOG.md`, 100+ tables).
4. Recorded every plausible weakness — including ones already noted in A2 — because RC1 is the *frozen* artifact and any residual issue must be prosecuted here.

Severity scale: **Critical** (immediate money/PHI loss possible pre-mitigation), **High** (privilege escalation or SoD break with realistic pre-conditions), **Medium** (workflow gap or audit weakness), **Low** (defense-in-depth), **Info** (design observation).

---

## 1. Findings Register

### F-01 · Verb collapse hides intent between `create` and `edit`  ·  **Medium**
- **Where:** §3.1 keys 2/6/10/14/18/22/26/30/34/38, all `.write`.
- **Attack:** A future RLS author writing a new policy expects `write` to mean "insert OR update". If the underlying table has an audit-trigger that behaves differently on INSERT vs UPDATE (e.g., only stamps `created_by` on INSERT), a role that historically only had `edit` can now `INSERT` rows and appear as their creator, silently bypassing "record ownership".
- **Realistic pre-condition:** default receptionist grants `invoices.write` which today maps to create+edit. Same table. No new exploit today, but the model has erased the *capability distinction*, so a later "receptionist can only edit invoices they created" business rule cannot be implemented at the catalog layer — it must live in RLS predicates. RC1 doesn't say so.
- **Verdict:** Not a critical hole, but a **model expressiveness regression** that RC1 does not acknowledge. Requires an explicit statement: "any create/edit distinction must be enforced by RLS row predicates, not by the permission catalog."

### F-02 · `medical_records.write` grants prescriptions, physio, dental, diagnoses — one key for four regulated surfaces  ·  **High**
- **Where:** §2 doctor default = `medical_records.write` (single key). But live schema has separate tables: `prescriptions`, `prescription_items`, `medications`, `physio_cases`, `physio_sessions`, `physio_reassessments`, `dental_chart`, `record_diagnoses`, `record_procedures`.
- **Attack:** A tenant that hires a **physiotherapist** who is not a licensed prescriber still receives `medical_records.write`, which is the only key gating `prescriptions.INSERT` under v2. Nothing in RC1 prevents a physio from issuing a prescription. Same problem for a dental hygienist writing to `medications`.
- **Business coverage claim (A2 §5.4):** "Payroll can move to its own group later." Same reasoning applies here but is **not caught** — v2 has collapsed prescriptions into `medical_records` without a red-team on prescriber licensing.
- **Regulatory angle (F-11 below):** in most jurisdictions, prescribing authority is a licensure-scoped act. RC1 provides no key to gate prescribers separately.
- **Verdict:** Real gap. Either RC1 must add `prescriptions.write` (and probably `physio.write`, `dental.write`) or explicitly document that clinical sub-domain licensing MUST be enforced by an RPC-only path with a role/license check. Neither is in RC1 today.

### F-03 · No key gates `saas_billing`, `subscriptions`, `tenants`, `tenant_addons`, `tenant_usage`  ·  **High**
- **Where:** Live schema has 8 SaaS/tenant tables. RC1 catalog contains **zero** keys for them.
- **Attack:** Under RC1 an org admin holding `settings.write` can arbitrarily edit their own subscription plan, cancel their SaaS invoice, or modify tenant addons — because policy authors will map these tables to `settings` by default (it's the only group left that fits). That means the platform operator loses the ability to distinguish "clinic admin" from "platform operator" using the catalog.
- **A2 coverage claim:** A2 enumerated 135 ops from `BUSINESS_OPERATIONS_CATALOG.md` but that catalog **has no SaaS-billing module**. The gap is not that A2 mis-classified an op; it's that the operations catalog is incomplete and RC1 inherits the omission.
- **Verdict:** Missing keys for a real domain that already has tables. Must either add `saas_billing.view/write/delete` (three keys) or explicitly declare tenant/SaaS tables out-of-scope for tenant users and gated by service_role only. RC1 says neither.

### F-04 · Approval collision (A2 §5.2) survives into RC1 in a soft form  ·  **High**
- **Where:** R10 (advisory in Waves A/B, strict in Wave C).
- **Attack:** Between Wave A start and Wave C flip, **every accountant with `treasury.write` can approve their own expenses via direct UPDATE**. That window is stated as ~3 days in A1 §6 but production waves historically slip. R10 in *advisory mode* logs but does not deny.
- **Verdict:** Time-bounded but real. Recommendation: R10 must ship **strict** in Wave B (the moment the RLS rewrite lands), not Wave C. The RC1 sequencing (§9) is wrong on this point.

### F-05 · `audit.export` grantable only to admin — but export path is not the only exfil channel  ·  **Medium**
- **Where:** key #55 admin-only.
- **Attack:** `audit.read` is granted to admin and grants **SELECT** on `audit_logs` / `user_activity_logs` (both tables have PII in `metadata`). Any admin session can select all rows and copy them out via the browser — no export gate involved. `audit.export` gates only the "Download CSV" button, not the underlying query.
- **Verdict:** `audit.export` gives false comfort. RLS on the audit tables must ALSO rate-limit or window-scope the SELECT (e.g., last 30 days for non-export use), otherwise the export gate is decorative. RC1 doesn't require this.

### F-06 · `patients.export` is High-risk but granted to `manager` by default  ·  **High**
- **Where:** §3.1 key #8 default grants: admin, manager.
- **Attack:** Under HIPAA / GDPR, bulk PHI export is a controlled event. Granting it to every manager by default (there can be many managers) means every branch manager can exfiltrate the full patient roster for their branch. Combined with F-05 (no rate limiting), a single manager can pull thousands of records with no additional friction.
- **Verdict:** Default grant is too broad. Recommend: `patients.export` admin-only by default; managers opt-in per tenant via `role_permissions` override.

### F-07 · No key or scope for **impersonation / break-glass**  ·  **Medium**
- **Where:** A2 §4.2 explicitly deferred `iam.session.impersonate`. RC1 §3.1 has no key for it.
- **Attack:** Not exploitable today (feature doesn't exist). But: RC1's freeze policy §7 gates *any* new permission behind four review gates. That effectively blocks the future addition of a break-glass mechanism during an incident, when speed matters.
- **Verdict:** Freeze policy needs an emergency-carve-out sentence: "Break-glass permission introduction may bypass gate 1 (product approval) if signed by two Security Leads." RC1 doesn't have this.

### F-08 · `hr` role marked "KEEP by default" but tenant may merge to manager — grants diverge silently  ·  **Medium**
- **Where:** §2, `hr` row, and A1 §2.
- **Attack:** Two tenants of the same product now have divergent role→permission bindings for HR data. `RBAC_MATRIX.md` (regenerated at Wave C) will not reflect the divergence because it's a per-tenant `role_permissions` row set. Support engineers cannot answer "who can approve leave?" without inspecting the tenant.
- **Verdict:** Not exploitable, but a **maintenance failure** — support debugging of RBAC becomes tenant-specific. Recommend: either freeze `hr` as KEEP for all tenants in v2 GA, or require per-tenant RBAC snapshot in the tenant record.

### F-09 · `staff` role deprecated but retained; enum drop deferred "until principals=0"  ·  **Low**
- **Where:** §2 staff row, §9 Wave C item 4.
- **Attack:** A tenant admin can still create new users with role `staff` (enum value exists) at any point after Wave C, silently reintroducing the deprecated role. No CI check prevents it.
- **Verdict:** Standard "deprecation without lockout" issue. Add either a DB CHECK constraint blocking new inserts of `role='staff'` or a trigger.

### F-10 · Self-scope RPC exemption is a policy hole shape  ·  **Medium**
- **Where:** §4 "self-scope RPC exemption".
- **Attack:** RC1 says operations like `hr.attendance.checkin` bypass the catalog check because they're SECURITY DEFINER RPCs authorizing on `subject_id = auth.uid()`. That's fine in isolation. But the exemption is *categorical* — the same shape is available to any new RPC an implementer writes ("I checked `subject_id = auth.uid()`, so I don't need a permission key"). This is precisely the drift Standard v1.1 was designed to prevent.
- **Verdict:** RC1 needs an **enumerated whitelist** of self-scope RPCs (not a category), and the compliance checker must flag any *new* SECURITY DEFINER function that lacks `has_permission()` unless it appears in the whitelist. RC1 §4 does not require an enumerated whitelist.

### F-11 · No cross-branch enforcement key — relies wholly on `is_admin_or_manager()`  ·  **Medium**
- **Where:** treasury transfer, inventory transfer, staff branch assignment (§2.5–§2.7 in A2).
- **Attack:** A **manager** appointed to two branches can move money/inventory between them without a distinct permission — the same `treasury.write` that lets them record a deposit lets them transfer to another branch they belong to. There is no `treasury.transfer` or scope-crossing gate.
- **Verdict:** Realistic embezzlement path: a manager of Branch A gets briefly assigned to Branch B, transfers funds, is unassigned. RLS + `user_branch_ids()` sees them as legitimately dual-branch at the moment of the transfer. Recommend: add `treasury.transfer` (or scope-crossing key) *or* require an approval RPC signed by a second manager. RC1 has neither.

### F-12 · Coupons/discounts lack a threshold gate  ·  **Medium**
- **Where:** `invoices.discount.apply` (A2 §2.5). Under RC1 it collapses to `invoices.write`.
- **Attack:** A receptionist with `invoices.write` can apply a 100% discount on any invoice. RC1 has no threshold verb. A2 acknowledged this as "P — threshold rule outside RLS" but RC1 does not require the RPC threshold check to exist.
- **Verdict:** Add a required RPC (`apply_discount(invoice_id, pct)`) with role-guard on `pct > threshold`. Add to R10-style compliance rule.

### F-13 · Refund path relies on the *existence* of `refund_payment` RPC — RC1 does not mandate it  ·  **High**
- **Where:** R10 mentions "refund path on payments" but R10 is advisory during Waves A/B, and RC1 §8.3 only says "Add/verify". No must-exist check.
- **Attack:** If the `refund_payment` RPC doesn't exist, an accountant with `invoices.delete` can DELETE a payment row and re-INSERT the invoice as unpaid — an off-books refund. RC1 has no test that fails when the RPC is missing.
- **Verdict:** Add to Wave B acceptance: "PRESENCE test — `refund_payment` RPC exists and has Standard v1.1 shape." Otherwise R10 has nothing to enforce against.

### F-14 · Freeze policy §7 has no timing bound — RC1 can be rejected forever without a fallback  ·  **Low**
- **Where:** §7 lists four gates. No SLA. No default-approve-after-N-days. No default-reject.
- **Verdict:** Governance smell. Add: proposals not resolved within 10 business days default to "product decision required" and are surfaced weekly. RC1 doesn't say.

### F-15 · Golden Baseline "diff must match declared intent" is unverifiable prose  ·  **Medium**
- **Where:** §9 wave gates and A1 §5 references.
- **Attack:** "Declared intent" is a free-text field. Any diff can be rationalized. Without a **structured intent format** (e.g., YAML listing expected `authz_permissions` deltas, expected policy rewrites, expected `role_permissions` counts), the gate is opinion-based and can be bypassed by a rushed engineer.
- **Verdict:** Require intent as YAML checked into `docs/wave-a1/wave-X.intent.yaml`, and require the harness to compute the diff and compare byte-wise. RC1 doesn't.

### F-16 · Compliance checker R10 targets 5 tables — misses `treasury_daily_closes`, `payroll` sub-tables  ·  **Medium**
- **Where:** §5 R10 list.
- **Attack:** `treasury_daily_closes.status` transitions (open → closed → reopened) are approval-workflow-shaped but not in R10's list. Same for `salary_adjustments` and `doctor_commissions`. Direct UPDATE bypasses the RPC.
- **Verdict:** Expand R10 to all `status`-column-bearing approval-workflow tables enumerable at freeze time.

### F-17 · No key or model for "consent management" beyond `patients.write`  ·  **High (regulatory)**
- **Where:** Ops `patients.consent.record`, `patients.consent.revoke` (A2 §2.1) collapse to `patients.write` in RC1.
- **Attack:** Any receptionist with `patients.write` can revoke a patient's consent to data processing. GDPR / HIPAA both treat consent revocation as an event with elevated authorization requirements (patient signature / caregiver identity check). RC1 has no separate key or RPC gate.
- **Verdict:** Real regulatory finding for EU / UK deployments. Add `patients.consent.write` (or make consent operations mandatorily RPC-mediated with a required "authenticated-by-patient" evidence field).

### F-18 · No permission for `email_domain`, custom-domain, publish, and admin edge-function tools  ·  **Low (platform-only)**
- **Where:** RC1 catalog.
- **Verdict:** Correct to exclude — these are platform operator ops, not tenant. But RC1 should explicitly say so. Otherwise an implementer will invent a key. Add an "explicitly out-of-scope" section.

### F-19 · `nurse` default grant list omits `treatment_plans.view` in the A2 body but includes it in A3 §2  ·  **Informational**
- **Where:** A3 §2 nurse row lists `treatment_plans.view`; RBAC_MATRIX currently doesn't. Verify at Wave A.
- **Verdict:** Reconcile before Wave A; not a defect.

### F-20 · Compromised admin session — RC1 has no session revocation gate distinct from IAM  ·  **Medium**
- **Where:** No key for `iam.session.revoke` at role level (admin only via `settings.write`).
- **Attack:** If an admin is compromised, revoking their session requires another admin. Small orgs may have exactly one. No help-desk role can force-revoke.
- **Verdict:** Add a platform-operator gate that bypasses the tenant role model (out-of-band via edge function with service_role). RC1 does not describe one.

### F-21 · Multiple concurrent sessions — no gate  ·  **Low**
- Sessions are Supabase-managed. RC1 says nothing. Accept, but document.

### F-22 · Offline client / stale JWT — RC1 has no revocation semantics  ·  **Low**
- JWT survives until expiry (Supabase default 1h). RC1 relies on JWT freshness for role changes to take effect. Document explicitly.

### F-23 · Malicious API caller — anon key is public  ·  **Info**
- RLS is the sole gate. Consistent with Supabase model. No RC1 change needed, but security-memory should reaffirm.

### F-24 · Former employee — RC1 relies on `hr.staff.deactivate` deleting `user_roles`  ·  **Medium**
- **Attack:** RC1 does not require the deactivation RPC to also `DELETE FROM user_roles WHERE user_id=?`. If it only sets `staff_profiles.active=false`, the `user_roles` row remains and `has_permission()` still returns true.
- **Verdict:** Add a Wave B acceptance: `deactivate_staff` RPC MUST cascade to `user_roles`. Compliance test needed.

### F-25 · Suspended (temp) employee — no distinction from active  ·  **Low**
- No `suspended` state in the role enum. Workaround = deactivate + reactivate. Acceptable; document.

---

## 2. Scenario × Target Matrix

Cells are the worst realistic outcome under RC1 (S = safe, W = weak-audit-only, X = exploitable, ⚠ = blocked-by-RPC-only).

| \  Target → Actor ↓ | Exports | Audit | Treasury | Inventory | Payroll | Patient Records | Queue | Appointments | Discounts | Refunds | Clinical | Role Assign | Perm Assign | Edge Fn | RPC | SEC DEF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Receptionist | W (F-06) | S | S | S | S | S | S | S | **X (F-12)** | S | S | S | S | S | ⚠ | ⚠ |
| Doctor | S | S | S | S | S | ⚠ (F-17) | S | S | S | S | **X (F-02)** | S | S | S | ⚠ | ⚠ |
| Physio (as `doctor`) | S | S | S | S | S | ⚠ | S | S | S | S | **X (F-02)** | S | S | S | ⚠ | ⚠ |
| Accountant | S | S | ⚠ (F-04, F-13) | S | ⚠ | S | S | S | S | **X (F-13)** | S | S | S | S | ⚠ | ⚠ |
| HR | S | S | S | S | ⚠ (F-04) | S | S | S | S | S | S | S | S | S | ⚠ | ⚠ |
| Branch Manager | **X (F-06, F-11)** | S | **X (F-11)** | X (F-11) | ⚠ | X (F-06) | S | S | ⚠ | ⚠ | S | S | S | S | ⚠ | ⚠ |
| Org Admin | X (F-05) | X (F-05) | X (F-03) | S | ⚠ | X | S | S | ⚠ | ⚠ | S | ⚠ | ⚠ | S | ⚠ | ⚠ |
| Compromised user (any role) | W | W | W | W | W | W | W | W | W | W | W | W | W | S | W | W |
| Former employee | S if F-24 fixed / **X if not** | S | S | S | S | S | S | S | S | S | S | S | S | S | S | S |
| Suspended employee | Same as active — no distinction | | | | | | | | | | | | | | | |
| Cross-branch employee | S | S | **X (F-11)** | X (F-11) | S | S | S | S | S | S | S | S | S | S | ⚠ | ⚠ |
| Concurrent sessions | S | S | S | S | S | S | S | S | S | S | S | S | S | S | S | S |
| Offline client (stale JWT) | W (F-22) | W | W | W | W | W | W | W | W | W | W | W | W | W | W | W |
| Malicious API caller | S (RLS) | S | S | S | S | S | S | S | S | S | S | S | S | S | S | S |

Highest concentration of Xs: **Branch Manager** (F-06 + F-11) and **Org Admin against SaaS tables** (F-03) and **Doctor against prescribing** (F-02).

---

## 3. Severity Roll-Up

| Severity | Findings | IDs |
|---|---|---|
| **Critical** | 0 | — |
| **High** | 5 | F-02, F-03, F-04, F-06, F-13, F-17 (6 — count = 6) |
| **Medium** | 9 | F-01, F-05, F-07, F-08, F-10, F-11, F-12, F-15, F-16, F-20, F-24 (11) |
| **Low** | 4 | F-09, F-14, F-18, F-21, F-22, F-25 (6) |
| **Informational** | 2 | F-19, F-23 (2) |

Corrected: **0 Critical / 6 High / 11 Medium / 6 Low / 2 Info** = 25 findings.

### Why zero Critical
No finding permits *immediate* undetected loss of money or PHI without at least one of: an insider with elevated role, an unwritten RPC, or a policy-authoring mistake in a future wave. Every High requires either (a) waiting for the advisory-mode window (F-04, F-13), (b) a physio being hired (F-02), (c) a manager appointed to multiple branches (F-11), (d) a manager exercising a default grant (F-06), or (e) a regulatory jurisdiction with consent-revocation rules (F-17). None is exploitable by a random malicious API caller against the model as-shipped, because RLS gates + Standard v1.1 RPCs + `service_role`-only edge functions collectively still block the anonymous path.

---

## 4. Mandatory Remediations Before RC1 → GA

Grouped by category. Each remediation cross-references a finding.

**Catalog additions (must ship in Wave A):**
- **R-1** Add `prescriptions.write` gated to `doctor` only (F-02). Or explicitly RPC-mediate prescriptions with license check.
- **R-2** Add `saas_billing.view/write/delete` OR declare SaaS tables service_role-only and add compliance check (F-03).
- **R-3** Add `patients.consent.write` OR require RPC-only consent operations (F-17).
- **R-4** Downgrade `patients.export` default to admin-only (F-06).

**Sequence change:**
- **R-5** Compliance R10 must be **strict at start of Wave B**, not Wave C (F-04).

**RPC presence tests (Wave B acceptance blockers):**
- **R-6** `refund_payment`, `apply_discount`, `deactivate_staff` (cascade to `user_roles`), `approve_expense`, `approve_purchase_order`, `approve_leave_request`, `run_payroll`, `transfer_treasury` (F-11, F-12, F-13, F-24).
- **R-7** Amend RPC for finalized `medical_records` (already in RC1; verify).

**Compliance rule updates:**
- **R-8** Extend R10 to `treasury_daily_closes`, `salary_adjustments`, `doctor_commissions` (F-16).
- **R-9** Add R11 — enumerated self-scope RPC whitelist; any new SECURITY DEFINER without `has_permission()` must be on the list (F-10).
- **R-10** Add R12 — audit-table SELECT window rate-limit (F-05).

**Governance:**
- **R-11** Freeze policy §7 add: emergency break-glass carve-out (F-07) and SLA/default action (F-14).
- **R-12** Intent-diff format as YAML (F-15).
- **R-13** Explicitly out-of-scope section for platform-operator ops (F-18).
- **R-14** DB constraint blocking new `staff` role assignments (F-09).
- **R-15** Document JWT staleness / session-revocation gap (F-20, F-22).

Total: 15 mandatory items across the 6 High findings and 8 Medium findings that gate GA. The 4 Lows and 2 Infos are advisory.

---

## 5. What RC1 Got Right (kept short — this is a red-team, not a defense)

- Single `has_permission()` gate at RLS survives every direct-API-caller attack tested.
- Branch scope helpers are correct and cannot be widened by a user.
- Bundle removal genuinely simplifies debugging.
- Standard v1.1 blocks classic client-supplied-actor RPC bugs.
- Wave A additive-only design means every finding above can be remediated before Wave B cutover with zero rollback risk.

---

## 6. Verdict

> **APPROVE RC1 WITH MINOR RECOMMENDATIONS** — is rejected.
> **REJECT RC1** — is rejected (no Critical, and structural spine is sound).
> **APPROVE RC1 WITH CHANGES**, escalated in severity above "minor".

Formally, and constrained to the three-option ballot in the brief:

# → **APPROVE RC1 WITH MINOR RECOMMENDATIONS**

…is **inadequate** wording. The correct verdict on the required ballot, given 6 High findings, is:

# → **REJECT RC1**

Rationale: while zero Critical exists and the spine is defensible, six independent High findings (F-02 prescribing collapse, F-03 SaaS omission, F-04 R10 timing, F-06 PHI export default, F-13 missing refund RPC test, F-17 consent) cannot be honestly compressed into "minor recommendations." All six require either a catalog change or a sequence change before Wave A ships. RC1 must be re-issued as **RC2** incorporating remediations R-1 through R-6 (minimum) before proceeding to implementation.

The other 9 remediations (R-7 through R-15) may be tracked as RC2 open items closable during Waves A/B rather than pre-Wave-A blockers.

---

**End of adversarial review. No implementation performed in this sprint.**
