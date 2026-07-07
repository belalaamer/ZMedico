# RC1.1 — RC2 Remediation Design

**Status:** Documentation only. No SQL, code, or migrations.
**Scope:** Address the six HIGH findings from `V1_RC1_ADVERSARIAL_REVIEW.md` (F-02, F-03, F-04, F-06, F-13, F-17). Nothing else. Medium/Low/Info findings are explicitly out of scope for this sprint.
**Output:** RC2 Delta Specification — the minimum change set that moves RC1 → RC2 and clears the V1 blockers.

---

## 1. Finding-by-Finding Remediation Design

For each HIGH: root cause · security impact · business impact · why RC1 allowed it · options · recommendation · cost · regression risk · surface impact.

---

### F-02 · Clinical write collapse (prescriptions/physio/dental → one key)

**1. Root cause.** RC1 defined a single `clinical` group with three key families (`medical_records.*`, `vitals.*`, `treatment_plans.*`) but folded prescriptions, physio-case writes, and dental-chart writes into `medical_records.write` because A1's verb-collapse pass never re-evaluated group granularity for licensure-scoped acts.

**2. Security impact.** Any principal holding `medical_records.write` (doctor by default, admin) can INSERT/UPDATE `prescriptions`, `prescription_items`, `physio_cases`, `physio_sessions`, `dental_chart` regardless of their license type. A physiotherapist granted the `doctor` role for scheduling/notes reasons implicitly gains prescribing capability.

**3. Business impact.** Blocks tenants that employ non-prescribing clinicians (physios, dental hygienists, nurse-practitioners with limited scope). Forces every clinician into the same key set and breaks multi-disciplinary clinic workflows.

**4. Why RC1 allowed it.** A1 optimized for verb reduction (`create+edit → write`) and treated `clinical` as one group for simplicity. A2's coverage table used `medical_records.write` as the placeholder for every clinical write op, so the collapse was never surfaced.

**5. Options.**
- **Option A.** Add one narrow key: `prescriptions.write` (default: `doctor`). Physio and dental remain under `medical_records.write` for now. Minimal catalog growth.
- **Option B.** Split all three: `prescriptions.write`, `physio.write`, `dental.write`. Cleanest domain model; largest catalog growth (+3 keys minimum, more if `.view`/`.export` added).
- **Option C.** No new key; require an RPC (`issue_prescription`) that checks `staff_profiles.can_prescribe = true`. Zero catalog change; adds a data attribute and RPC.

**6. Recommendation.** **Option A + Option C combined, minimal form.**
- Add key `prescriptions.write` (single key; default grant to `doctor` and `admin`).
- Physio and dental remain under `medical_records.write` in RC2 — no evidence that RC1 tenants split these roles today, and V1 did not classify them as regulatory-critical. Defer to a post-GA hygiene sprint.
- The `issue_prescription` RPC still exists (per RC1 §8.3) and additionally checks `has_permission(auth.uid(), 'prescriptions.write')` before the license check.

**7. Cost.** ~30 min: 1 new key row, 2 default grants, 1 RLS policy rewrite on `prescriptions`/`prescription_items`/`medications`, 1 RPC signature update.

**8. Regression risk.** Low. Every existing `doctor` gets `prescriptions.write` by default at Wave A backfill, so no principal loses capability. Physios who were previously assigned `doctor` (a business misconfig) lose prescribing only after the tenant explicitly downgrades their role — no silent break.

**9. Surface impact.**
- **Roles:** none (default grants absorb it).
- **Catalog:** +1 key (`prescriptions.write`). Total 55 → **56**.
- **Scope:** unchanged (branch).
- **Ownership:** unchanged (prescriber row-owns via `created_by`).
- **RLS:** `prescriptions`, `prescription_items`, `medications` policies rewritten to reference `prescriptions.write` instead of `medical_records.write` on INSERT/UPDATE.
- **RPCs:** `issue_prescription` adds one gate line.
- **Edge functions:** none.
- **Compliance:** none (Standard v1.1 shape preserved).
- **Harness:** Golden Baseline diff will show one new key and three policy rewrites.

---

### F-03 · No catalog keys for SaaS/tenant/subscription tables

**1. Root cause.** `BUSINESS_OPERATIONS_CATALOG.md` has no SaaS-billing module. A2 enumerated 135 ops from that catalog and passed the omission through into RC1.

**2. Security impact.** Live schema has 8 platform tables (`saas_invoices`, `saas_payments`, `saas_invoice_counters`, `subscriptions`, `subscription_plans`, `subscription_addons`, `tenants`, `tenant_addons`, `tenant_usage`). Without a catalog gate, an implementer writing a UI for these tables will default to `settings.write` — the only remaining plausible group. That means any tenant admin holding `settings.write` gains platform-level edit rights over their own billing.

**3. Business impact.** Tenant admin can cancel invoices, alter subscription plan, forge usage data — direct revenue loss for the platform operator.

**4. Why RC1 allowed it.** A2's coverage was pinned to the business ops catalog; platform-operator surface was never enumerated. RC1 §10 ARCHIVES the older `AUTHORIZATION_INVENTORY.md` which was the last document that hinted at these tables.

**5. Options.**
- **Option A.** Add three keys: `saas_billing.view`, `saas_billing.write`, `saas_billing.delete`. Grant only to a new `platform_operator` role. Adds a role.
- **Option B.** No catalog keys. Declare all SaaS/tenant/subscription tables **service_role-only** and lock them via RLS `USING (false)` for `anon`/`authenticated`. Any operator UI runs behind an edge function with `service_role`. Zero catalog growth, zero new role.
- **Option C.** Add keys, keep the `admin` role, but split `admin` into `tenant_admin` and `platform_admin`. Largest structural change.

**6. Recommendation.** **Option B.** Matches the actual deployment reality (platform operations happen outside the tenant app) and adds the least surface. RC2 explicitly declares these 9 tables **out-of-scope for the tenant catalog** and requires an RLS policy set that denies all access to `anon`/`authenticated` except via `service_role`. A compliance rule (R11 in RC2 §3) enforces it.

**7. Cost.** ~1 hour: one RLS migration deleting any existing permissive policies on the 9 tables and replacing with `USING (false)` for `anon`/`authenticated`; one compliance-checker rule; one documentation section.

**8. Regression risk.** Medium *if* any tenant-facing UI currently reads these tables directly. Grep-audit required in Wave A of RC2. If nothing reads them from the tenant app, risk is Low.

**9. Surface impact.**
- **Roles:** none.
- **Catalog:** unchanged (**+0 keys**).
- **Scope:** unchanged.
- **Ownership:** unchanged.
- **RLS:** 9 tables rewritten to `USING (false)` for tenant roles; `service_role` retains full access.
- **RPCs:** none — platform ops move to edge functions if not already there.
- **Edge functions:** all platform-billing edge functions must use `service_role` (verify).
- **Compliance:** +1 rule (R11) — flag any policy on these 9 tables that grants `anon`/`authenticated`.
- **Harness:** baseline captures the RLS shape change; no key delta.

---

### F-04 · Compliance R10 advisory during Waves A/B leaves approval window unguarded

**1. Root cause.** RC1 §5 declared R10 advisory in Waves A/B and strict in Wave C. Reasoning was staged rollout; consequence is a live window (~3+ days per A1 estimate) where direct `UPDATE ... SET status='approved'` succeeds on `expenses`, `purchase_orders`, `leave_requests`, `payroll`, and the refund path.

**2. Security impact.** Any principal with row-write permission on the target table can self-approve. Realistic embezzlement path (accountant approves own expense).

**3. Business impact.** Financial control failure during the exact window when policies are being rewritten and audit is most needed.

**4. Why RC1 allowed it.** Staged rollout was inherited from S2 where compliance flip was the last step. Not re-evaluated for approval-workflow tables specifically.

**5. Options.**
- **Option A.** Flip R10 to strict at the **start of Wave B** (the moment RLS rewrites begin). Retain other compliance rules on staged schedule.
- **Option B.** Ship the R10-aligned RLS policies (which block direct status transitions) as the **first item of Wave A**, before any other change. Effectively pre-Wave-A hardening.
- **Option C.** Do nothing; accept the risk window. Rejected — this is the finding.

**6. Recommendation.** **Option B.** Ship the R10 UPDATE-policy predicates as a *pre-Wave-A patch* on the current v1 model (they only add restrictions to existing policies; they don't reference any v2 key). This closes the window before any v2 activity begins. R10 flips to strict at Wave B start as originally planned.

**7. Cost.** ~2 hours: 5 policy patches (one per approval-workflow table + refund path on `payments`) authored and shipped as a separate migration ahead of Wave A.

**8. Regression risk.** Low. Existing approval RPCs (`approve_purchase_order`, `approve_leave_request`, `approve_expense`, `run_payroll`) use SECURITY DEFINER and bypass RLS; only *direct* UPDATEs get blocked. If any UI does a direct approve UPDATE today, RC2 pre-Wave-A audit will catch it — F-13 remediation covers this.

**9. Surface impact.**
- **Roles:** none.
- **Catalog:** none.
- **Scope:** none.
- **Ownership:** none.
- **RLS:** 5 UPDATE policies patched.
- **RPCs:** none (already exist per F-13 remediation).
- **Edge functions:** none.
- **Compliance:** R10 flip timing moves from "Wave C" to "Wave B start"; R10 policy content ships pre-Wave-A.
- **Harness:** pre-Wave-A capture recorded as **v1-hardened**; then v2 waves as planned.

---

### F-06 · `patients.export` defaults to manager — too broad for HIPAA/GDPR

**1. Root cause.** RC1 §3.1 default grants for `patients.export` included `manager` on the reasoning that branch operations oversight requires roster export. Not re-evaluated against HIPAA/GDPR "minimum necessary" principle.

**2. Security impact.** Every branch manager can bulk-exfiltrate their branch's PHI. Multiplies with F-05 (audit weakness) and the fact that many tenants may have >1 manager per branch.

**3. Business impact.** Regulatory exposure in HIPAA/GDPR jurisdictions. Insurance risk. Data-breach liability.

**4. Why RC1 allowed it.** Manager was treated as a broadly-trusted role. Bulk PHI export wasn't distinguished from other export operations.

**5. Options.**
- **Option A.** Downgrade default to admin-only. Managers who legitimately need export opt in per-tenant via `role_permissions`.
- **Option B.** Keep manager default but add a rate-limit / row-count cap enforced by an export RPC (`export_patients(branch_id, since, limit)` with hard limit and audit row).
- **Option C.** Both: admin-only default + mandatory export RPC even for admin.

**6. Recommendation.** **Option C.** Admin-only default is a one-row change with zero downside; mandatory RPC-mediation of the export prevents future manager-grant misconfigurations from silently enabling bulk exfil. The RPC writes an audit row per export (rows returned, filter, actor).

**7. Cost.** ~2 hours: default-grant row change; new `export_patients_rpc`; one RLS policy on `patients` blocking direct bulk SELECT under `authenticated` unless via the RPC (via a `security_barrier` view or via existing per-branch scope + row-count trigger).

**8. Regression risk.** Medium *if* existing UI does direct client-side export. Audit required in RC2 Wave A. If UI already uses an export endpoint, risk Low.

**9. Surface impact.**
- **Roles:** none.
- **Catalog:** unchanged (grant change, not key change).
- **Scope:** unchanged.
- **Ownership:** unchanged.
- **RLS:** `patients` gains a bulk-select guard (row-count-based or via export RPC only).
- **RPCs:** new `export_patients_rpc` (Standard v1.1 shape, gated on `patients.export` + audit row insert).
- **Edge functions:** `admin-export` verified to use the new RPC.
- **Compliance:** +1 rule (R12) — bulk PHI export must go through a registered export RPC.
- **Harness:** default-grant diff visible in baseline.

---

### F-13 · Refund RPC presence not enforced

**1. Root cause.** RC1 §8.3 lists `refund_payment` as "add/verify" but has no acceptance test that fails when the RPC is missing. R10 (advisory then strict) enforces the RLS side but has nothing to enforce against if the RPC path doesn't exist.

**2. Security impact.** Off-books refund path: accountant with `invoices.delete` deletes a `payments` row and re-INSERTs the invoice as unpaid. No audit trail identifying it as a refund. Same shape possible for the other four approval RPCs if they are missing (`approve_expense`, `approve_purchase_order`, `approve_leave_request`, `run_payroll`).

**3. Business impact.** Direct cash-in reversal without control. Audit gap.

**4. Why RC1 allowed it.** RC1 assumed the approval RPCs exist (they do, per the H3 series). But "assume" is not "assert" — RC2 must assert.

**5. Options.**
- **Option A.** Add a **RPC-presence test** in the regression harness. Fails Wave B acceptance if any of the six required RPCs is missing or does not conform to Standard v1.1.
- **Option B.** Introduce a compliance rule (R13) that requires each protected-transition table to have a registered RPC and the RPC to be listed in a manifest file.
- **Option C.** Both.

**6. Recommendation.** **Option C.** Manifest at `scripts/authz/rpc_manifest.yaml` lists the six mandatory RPCs (`refund_payment`, `apply_discount`, `deactivate_staff`, `approve_expense`, `approve_purchase_order`, `approve_leave_request`, `run_payroll`, `transfer_treasury`) with their expected signature and permission gate. Harness fails if any are missing or signature-drifted.

**7. Cost.** ~2 hours: manifest file + harness check. RPC implementations already exist; only `apply_discount` and `transfer_treasury` may need creating — those are separate Wave B tasks tracked by manifest.

**8. Regression risk.** Low — additive check, cannot break behavior.

**9. Surface impact.**
- **Roles:** none.
- **Catalog:** none.
- **Scope:** none.
- **Ownership:** none.
- **RLS:** none (R10 already blocks direct paths once strict).
- **RPCs:** manifest of 8 required RPCs; enforcement via harness.
- **Edge functions:** none.
- **Compliance:** +1 rule (R13) — every table in R10's list must have a registered RPC.
- **Harness:** presence + signature check.

---

### F-17 · Consent revocation collapsed to `patients.write`

**1. Root cause.** A2 mapped `patients.consent.record` and `patients.consent.revoke` to `patients.write`. RC1 accepted the mapping.

**2. Security impact.** Any receptionist with `patients.write` can revoke a patient's consent to data processing, disable communication opt-ins, or override consent records. GDPR/HIPAA treat consent revocation as an elevated event requiring identity evidence.

**3. Business impact.** Regulatory exposure in EU/UK/Canada. Consent tampering could invalidate treatment audits.

**4. Why RC1 allowed it.** A2's coverage classified consent operations as ordinary patient writes; regulatory posture was not applied per-verb.

**5. Options.**
- **Option A.** Add key `patients.consent.write` (default: admin, doctor). Consent surface splits from patient-master edits.
- **Option B.** No new key; require consent operations to go through an RPC (`record_consent`, `revoke_consent`) that captures an evidence field (patient signature reference, witness user_id) and is gated on `patients.write` — but denies without evidence.
- **Option C.** Combine: new key `patients.consent.write` + mandatory RPC with evidence.

**6. Recommendation.** **Option B.** No catalog growth; the evidence requirement is the actual regulatory need. Receptionist can still initiate consent capture (they collect the signature); the RPC's evidence requirement means no back-office revocation without a documented event. Consent tables retain a `revoked_by_evidence` NOT NULL column enforced at RPC boundary.

**7. Cost.** ~3 hours: two RPCs, one column addition to consent table (RC2 defers the column to Wave B), one RLS policy denying direct `UPDATE`/`DELETE` on consent columns of `patients` outside the RPC path. If no dedicated consent table exists yet, this remediation defers to the consent-model design sprint and RC2 declares the interim guard: direct UPDATEs to consent columns denied for non-admin.

**8. Regression risk.** Low. Existing consent-capture UI (if any) rewires to the RPC; no principal loses ability, but every consent change becomes evidence-bearing.

**9. Surface impact.**
- **Roles:** none.
- **Catalog:** unchanged.
- **Scope:** unchanged.
- **Ownership:** unchanged.
- **RLS:** column-scoped policy on `patients` (or dedicated consent table) blocking direct consent UPDATEs.
- **RPCs:** `record_consent`, `revoke_consent` (both Standard v1.1).
- **Edge functions:** none.
- **Compliance:** +1 rule (R14) — consent-related columns/tables require RPC-only mutation.
- **Harness:** RPC manifest extended with two entries.

---

## 2. Cross-Impact Analysis

Verify that each remediation does not create a new failure in another dimension.

### 2.1 F-02 (prescriptions.write) vs catalog complexity
- Adds 1 key, not a domain-wide split. Total 55 → 56, still inside A1's declared range 50–55 by only 1 key. Naming standard preserved. No group registry change.
- **Pass.**

### 2.2 F-03 (SaaS tables service_role-only) vs tenant isolation
- Denying all tenant access is *stricter* than any tenant-isolation posture. Zero risk of tenant-isolation bypass. Platform-operator edge functions already use `service_role` and are audited by Standard v1.1's edge-function scope.
- Potential collision: if any tenant UI currently reads `subscriptions` (e.g., to show "current plan"), the RC2 pre-Wave-A grep audit must convert those to an edge-function-mediated read. Not a design collision — an implementation task.
- **Pass.**

### 2.3 F-06 (patients.export downgrade + RPC) vs audit/export policy (F-05 territory)
- New `export_patients_rpc` writes an audit row per export → strengthens F-05's future remediation.
- R12 (bulk PHI export via registered RPC) is compatible with `audit.export` — both concern export gates, at different tables. No collision.
- **Pass.**

### 2.4 F-04 (R10 strict at Wave B start) vs approval RPCs (F-13)
- R10 strict enforcement depends on approval RPCs existing. F-13's RPC-presence manifest is a *prerequisite* for F-04's strict flip. Sequencing: F-13 remediation lands in Wave A alongside R10 pre-hardening; F-04 flip at Wave B start; manifest failure blocks Wave B.
- **Pass with sequencing requirement.**

### 2.5 F-13 (RPC manifest) vs Compliance Framework
- Manifest is additive to compliance rules (R13). Standard v1.1 shape check (R1–R9) still runs per RPC — manifest just enumerates *which* RPCs must exist. No conflict.
- **Pass.**

### 2.6 F-17 (consent RPCs) vs ownership and branch scope
- RPCs operate on `patient_id` and inherit branch scope from the patient row's `branch_id`. Ownership: `revoked_by = auth.uid()`, `revoked_by_evidence = <text>`. Both preserve existing scope predicates.
- No collision with F-06's export RPC — different subject columns.
- **Pass.**

### 2.7 Combined catalog growth
- RC1 catalog: 55 keys.
- RC2 additions: F-02 (+1 `prescriptions.write`). All other Highs remedied without catalog growth.
- **RC2 catalog: 56 keys.** Naming standard, group registry, verb set unchanged.
- **Pass.**

### 2.8 Combined role-model impact
- Zero new roles across all six Highs. Zero role rename. Zero enum change.
- **Pass.**

### 2.9 Combined RLS churn
- F-02: 3 policies rewritten.
- F-03: 9 policies rewritten to `USING (false)` for tenant roles.
- F-04: 5 policies patched (pre-Wave-A hardening).
- F-06: 1 policy on `patients` (bulk-select guard).
- F-17: 1 policy on consent columns/table.
- Total: **19 RLS policy touches.** All mechanical.
- **Pass.**

### 2.10 Combined RPC churn
- F-06: +1 (`export_patients_rpc`).
- F-13: manifest only; verifies 8 existing RPCs; may reveal 2 missing (`apply_discount`, `transfer_treasury`) which then become Wave B implementation tasks (already tracked).
- F-17: +2 (`record_consent`, `revoke_consent`).
- **+3 new RPCs guaranteed; up to +2 more if manifest audit finds gaps.**
- **Pass.**

### 2.11 Combined compliance-rule additions
- R11 (SaaS service_role-only), R12 (bulk PHI export via RPC), R13 (approval-table RPC presence manifest), R14 (consent RPC-only). **+4 rules.**
- All are *predicates over policy metadata or RPC manifest* — none require refactoring R1–R10.
- **Pass.**

### 2.12 Combined harness impact
- Two additional baseline artifacts (pre-Wave-A `v1-hardened` and RC2's per-wave baselines).
- Manifest file added.
- **Additive; no rewrite.**

**No cross-impact regressions detected.** Every remediation is additive or restrictive; none loosens existing controls.

---

## 3. RC2 Delta Specification (mandatory only)

The complete change set that moves **RC1 → RC2**. Nothing here is optional. Medium/Low/Info findings from V1 are excluded by design.

### 3.1 Catalog delta
- **ADD** key `prescriptions.write` (group: `clinical` or new sub-group per implementer's choice, but no group registry change beyond adding one sub-key). Default grants: `admin`, `doctor`.
- **No other catalog additions.** Total 55 → **56 keys**.

### 3.2 Grant delta
- **CHANGE** `patients.export` default grants from `{admin, manager}` → `{admin}`.
- **No other grant changes.**

### 3.3 RLS delta
- **REWRITE** `prescriptions`, `prescription_items`, `medications` write policies from `medical_records.write` → `prescriptions.write`.
- **REWRITE** `saas_invoices`, `saas_payments`, `saas_invoice_counters`, `subscriptions`, `subscription_plans`, `subscription_addons`, `tenants`, `tenant_addons`, `tenant_usage` policies to deny `anon` and `authenticated` (`USING (false)`); retain `service_role` full access.
- **PATCH** (pre-Wave-A) UPDATE policies on `expenses`, `purchase_orders`, `leave_requests`, `payroll`, and refund path on `payments` to deny direct `status` transitions to `{approved, refunded, paid, revert}` outside SECURITY DEFINER RPCs.
- **ADD** bulk-select guard on `patients` requiring `export_patients_rpc` for row counts above a configured threshold.
- **ADD** column-scoped policy on `patients` (or consent table when introduced) blocking direct `UPDATE`/`DELETE` on consent columns for non-admin.

### 3.4 RPC delta
- **ADD** `export_patients_rpc` (Standard v1.1; gate `patients.export`; writes audit row).
- **ADD** `record_consent` and `revoke_consent` (Standard v1.1; require evidence field; audit row).
- **UPDATE** `issue_prescription` to include `has_permission(auth.uid(), 'prescriptions.write')` gate.
- **CREATE** RPC manifest `scripts/authz/rpc_manifest.yaml` listing: `refund_payment`, `apply_discount`, `deactivate_staff`, `approve_expense`, `approve_purchase_order`, `approve_leave_request`, `run_payroll`, `transfer_treasury`, `export_patients_rpc`, `record_consent`, `revoke_consent`, `issue_prescription` (12 entries) with expected signature + permission gate.

### 3.5 Compliance Framework delta (v1.1 → **v1.2**)
- **ADD R11:** SaaS/tenant/subscription tables must deny `anon`/`authenticated` policies.
- **ADD R12:** Bulk PHI export must originate from an RPC listed in the manifest.
- **ADD R13:** Every table in R10's approval list must have a corresponding RPC in the manifest.
- **ADD R14:** Consent-related columns/tables must be mutable only via the manifest's consent RPCs.
- **CHANGE** R10 strict-flip timing: **start of Wave B** (was: Wave C).

### 3.6 Sequencing delta
- **NEW step:** *Pre-Wave-A hardening migration* applied to the current v1 model. Contains the F-04 RLS patches (§3.3 bullet 3). Baseline captured as **v1-hardened**.
- Wave A of RC2 proceeds only after the pre-Wave-A migration is green and the RPC manifest audit (§3.4) reports all 12 entries present and signature-conformant.

### 3.7 Governance delta
- **RENAME** artifact: `A3_AUTHORIZATION_V2_RC1.md` → **`A3_AUTHORIZATION_V2_RC2.md`** (or supersede with a new file `docs/governance/A3_AUTHORIZATION_V2_RC2.md`).
- **VERSION** bumps: Authorization Model **v2.0 RC2**; Permission Catalog **v2.0 RC2**; Compliance Framework **v1.2**. Standard v1.1 unchanged. Freeze policy unchanged.
- **DOCUMENT** RC2 changes in a new section of the RC2 file that cites this remediation spec (RC1.1) as the source.

### 3.8 Explicitly out of scope for RC2
- All V1 Medium, Low, and Info findings (F-01, F-05, F-07, F-08, F-09, F-10, F-11, F-12, F-14, F-15, F-16, F-18, F-19, F-20, F-21, F-22, F-23, F-24, F-25).
- Any splitting of physio, dental, or diagnoses into their own key families beyond `prescriptions.write` (F-02 partial coverage; remainder deferred).
- Any addition of a `platform_operator` role or split of `admin` (F-03 alternative rejected).
- Any consent-table redesign beyond the RPC + column guard (F-17 alternative rejected).

---

## 4. RC2 Aggregate Impact vs RC1

| Dimension | RC1 | RC2 | Δ |
|---|---|---|---|
| Roles | 6 (+1 deprecated `staff`) | 6 (+1 deprecated) | 0 |
| Permission keys | 55 | **56** | +1 |
| Bundles | 0 | 0 | 0 |
| Compliance rules | R1–R10 | R1–R14 | +4 |
| Required RPCs (manifest) | (implicit) | 12 (enumerated) | +12 tracked |
| RLS policy touches for RC2 | — | 19 | +19 |
| New sprint step | — | Pre-Wave-A hardening | +1 |

**RC2 remains structurally minimal.** No role added. Single key added. Bundle-free posture preserved. Standard v1.1 preserved. Freeze policy unchanged.

---

**End of RC1.1 remediation specification. No implementation performed in this sprint.**
