# Business Authorization V4 — Enterprise Framework
# نموذج الصلاحيات المؤسسي — الإصدار الرابع

> **Status:** Documentation only. Fully backward-compatible with V3 and
> V3.1. **No** code, schema, RLS, DEFINER, edge function, authentication,
> permission-engine, types, enum, API, component, route, hook, service,
> or test changes are performed by this document.
>
> **الحالة:** توثيق فقط. متوافق تمامًا مع V3 و V3.1.

---

## Table of Contents / الفهرس

1. Enterprise Authorization Principles
2. Enterprise Permission Metadata
3. Attribute-Based Access Control (ABAC)
4. Permission Dependency Graph
5. Permission Classification
6. Feature Flags
7. Licensing Layer
8. Enterprise Audit Framework
9. Compliance Framework
10. Enterprise Permission Registry Standard
11. Authorization Validation Rules
12. Authorization Maturity Model
13. Future Roadmap
14. Change Report

---

## 1. Enterprise Authorization Principles / مبادئ الصلاحيات المؤسسية

V4 preserves every V3/V3.1 principle (branch isolation, least privilege,
segregation of duties, no hard delete for business records, clinical
auditability, financial accountability) and elevates them into an
explicit, testable set of enterprise architecture principles.

| # | Principle (EN) | المبدأ (AR) | Meaning |
|---|---|---|---|
| P1 | Least Privilege | الحد الأدنى من الصلاحيات | Actors receive the smallest permission set required. Grants are additive, never "just in case." |
| P2 | Separation of Duties (SoD) | فصل المهام | No single actor may originate, review, and finalize a sensitive workflow (refunds, clinical approvals, user provisioning, payroll). |
| P3 | Zero Trust | انعدام الثقة الافتراضي | Every request is authenticated, authorized, and validated independently. No implicit trust from network origin or prior authorization. |
| P4 | Defense in Depth | الدفاع متعدد الطبقات | Authorization is enforced at UI (guards), API (edge functions), and data (RLS + DEFINER) layers. |
| P5 | Auditability | قابلية التدقيق | Every state-changing action produces an immutable audit event; every denial on Sensitive/Critical is logged. |
| P6 | Branch Isolation | عزل الفروع | Non-global roles operate within `user.branch_id = resource.branch_id`. |
| P7 | Clinical Integrity | سلامة السجل السريري | Clinical records follow `draft → submitted → approved`; approved records are immutable. |
| P8 | Financial Integrity | سلامة السجل المالي | No hard delete of financial records; reversals via compensating entries; three-hand refund SoD. |
| P9 | Compliance | الامتثال التنظيمي | PII/PHI flows respect HIPAA-style and GDPR-style regimes. Retention and export are audited. |
| P10 | Scalability | القابلية للتوسع | Registry, ABAC, and dependencies scale to hundreds of permissions and dozens of roles without policy explosion. |
| P11 | Multi-Tenant Ready | جاهزية تعدد المستأجرين | Every decision evaluates within `tenant_id` + `branch_id`. Cross-tenant access is impossible by construction. |

### Design corollaries

- Explicit deny wins. A missing permission or a failing condition = deny.
- Grants are declarative. Runtime code never invents permissions.
- Change is versioned (see BA01 Authorization Version Registry).
- Bilingual first: every permission, role, and condition carries EN + AR labels.

---

## 2. Enterprise Permission Metadata / بيانات وصف الصلاحيات

V4 promotes every permission from a bare `group.verb[.qualifier]` string
into a first-class metadata object. The runtime keeps accepting the
string `id`; the object supplies the context the engine, UI, audit, and
compliance layers need.

### 2.1 Fields

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | string | yes | Stable key, `group.verb[.qualifier]`, snake_case. |
| `english_label` | string | yes | UI label (EN). |
| `arabic_label` | string | yes | UI label (AR). |
| `module` | enum | yes | Clinical, Finance, HR, Inventory, Communication, Reports, Settings, Governance, SaaS. |
| `category` | string | yes | Sub-domain (e.g. `medical_records`, `refunds`, `payroll`). |
| `classification` | enum | yes | `normal` \| `sensitive` \| `critical` (§5). |
| `feature_flag` | string \| null | no | Feature that must be enabled (§6). |
| `required_license` | enum \| null | no | Lowest plan that unlocks the permission (§7). |
| `dependencies` | object | no | `{ requires, implies, conflicts_with }` (§4). |
| `conditions` | array | no | ABAC condition references (§3). |
| `audit_required` | boolean | yes | Emit audit on every allow/deny. |
| `mfa_required` | boolean | yes | Require recent MFA step-up. |
| `approval_required` | boolean | yes | Must go through approval workflow. |
| `deprecated` | boolean | yes | Hidden from pickers; slated for removal. |
| `description` | string | yes | Paragraph for compliance/admin UI. |

### 2.2 YAML example

```yaml
- id: medical_records.view
  english_label: View Medical Records
  arabic_label: عرض السجل الطبي
  module: Clinical
  category: medical_records
  classification: sensitive
  feature_flag: ClinicalWorkflow
  required_license: Starter
  dependencies:
    requires: []
    implies: []
    conflicts_with: []
  conditions: [SameBranch, AssignedPatient]
  audit_required: true
  mfa_required: false
  approval_required: false
  deprecated: false
  description: >
    Read a patient's medical record. Restricted to the assigned clinician
    within the same branch. Every view is audit-logged.

- id: medical_records.approve
  english_label: Approve Medical Record
  arabic_label: اعتماد السجل الطبي
  module: Clinical
  category: medical_records
  classification: critical
  feature_flag: ClinicalWorkflow
  required_license: Professional
  dependencies:
    requires: [medical_records.review, medical_records.view]
  conditions: [SameBranch, SubmittedOnly, MedicalDirector, MFAAuthenticated]
  audit_required: true
  mfa_required: true
  approval_required: false
  deprecated: false
  description: >
    Locks a submitted medical record. Approved records are immutable;
    corrections require an amendment record.

- id: payments.refund_approve
  english_label: Approve Refund
  arabic_label: اعتماد الاسترداد
  module: Finance
  category: refunds
  classification: critical
  required_license: Professional
  dependencies:
    requires: [payments.refund_review, payments.view]
  conditions: [SameBranch, RefundApprover, MFAAuthenticated]
  audit_required: true
  mfa_required: true
  approval_required: false
  deprecated: false
  description: >
    Branch Manager finalizes a refund requested by a Cashier and reviewed
    by an Accountant. Cannot equal either upstream actor.
```

---

## 3. Attribute-Based Access Control (ABAC) / التحكم القائم على السمات

RBAC answers **who** may act. ABAC answers **when** they may act. V4
layers a small, reusable Condition Library on top of the existing RBAC
bundle model so a permission can be granted broadly and then constrained
by context.

> `allow = role_has(permission) AND all(conditions_evaluate_true)`

### 3.1 Condition Library

**Branch** — `SameBranch`, `AnyBranch`, `AssignedBranch`.

**Ownership** — `OwnRecord`, `CreatedByCurrentUser`, `AssignedPatient`,
`AssignedAppointment`, `AssignedInvoice`.

**Clinical** — `AssignedDoctor`, `Reviewer`, `Approver`,
`MedicalDirector`, `DraftOnly`, `SubmittedOnly`, `ApprovedOnly`,
`NotArchived`.

**Financial** — `CashDrawerOwner`, `TreasuryOwner`, `RefundReviewer`,
`RefundApprover`.

**User** — `ActiveUser`, `VerifiedUser`, `MFAAuthenticated`.

**Time** — `BusinessHours`, `WorkingShift`.

### 3.2 Examples

```yaml
- id: appointments.edit
  conditions: [SameBranch, AssignedAppointment, NotArchived]

- id: payments.refund_review
  conditions: [SameBranch, RefundReviewer]

- id: treasury.edit
  conditions: [SameBranch, TreasuryOwner, WorkingShift, MFAAuthenticated]

- id: medical_records.edit
  conditions: [SameBranch, AssignedDoctor, DraftOnly]
```

### 3.3 Evaluation semantics

- Conditions AND together; any failure = deny.
- Conditions are pure functions of `(user, resource, context)`.
- Missing resource context short-circuits resource-bound conditions and
  defers to RLS.

---

## 4. Permission Dependency Graph / مخطط الاعتمادية

Three relationships are formalized.

| Relationship | Semantics |
|---|---|
| `requires` | Target permission must also be present. Enforced at bundle validation and runtime. |
| `implies` | Granting this permission virtually grants the listed ones. |
| `conflicts_with` | Two permissions that MUST NOT coexist in a bundle (SoD). |

### 4.1 Examples

```yaml
- id: medical_records.approve
  dependencies: { requires: [medical_records.review, medical_records.view] }

- id: payments.refund_approve
  dependencies: { requires: [payments.refund_review, payments.view] }

- id: users.deactivate
  dependencies: { requires: [users.view] }

- id: payroll.run
  dependencies: { requires: [payroll.view], implies: [payroll.export] }

- id: payments.refund_request
  dependencies:
    conflicts_with: [payments.refund_review, payments.refund_approve]
```

### 4.2 Automatic validation

CI must run on every registry / bundle change:

1. **Closure check** — every `requires(p)` is granted.
2. **Conflict check** — no pair `(p, q)` where `q ∈ conflicts_with(p)`.
3. **Implication expansion** — `implies` materialized into an
   `effective_permissions` set for runtime cache + audit.

### 4.3 Sketch

```
medical_records.view
  ├── medical_records.edit         (draft only, assigned doctor)
  ├── medical_records.review       (SoD Reviewer)
  │     └── medical_records.approve (MedicalDirector, MFA)
  └── medical_records.export       (sensitive)

payments.view
  ├── payments.refund_request ─┐
  ├── payments.refund_review  ─┤ mutually conflicts
  └── payments.refund_approve ─┘
```

---

## 5. Permission Classification / تصنيف الصلاحيات

| Level | Meaning |
|---|---|
| `normal` | Low-blast-radius operational actions. |
| `sensitive` | PII / PHI / financial detail. Audit + reason on write. |
| `critical` | System-level or irreversible. Requires MFA + approval. |

### 5.1 Examples

**Critical** — `permissions.manage`, `roles.manage`, `users.delete`,
`users.activate`, `backup.restore`, `system.shutdown`,
`medical_records.approve`, `payments.refund_approve`, `payroll.run`,
`treasury.close`, `governance.break_glass`.

**Sensitive** — `payroll.view`, `medical_records.export`,
`audit_logs.export`, `financial_reports.export`, `patients.export`,
`hr.view`, `treasury.view`, `invoices.approve`.

**Normal** — `patients.view`, `appointments.view`, `queue.view`,
`services.view`, `products.view`, `communication.view`.

### 5.2 Defaults matrix

| Classification | Audit | MFA | Reason | Approval |
|---|---|---|---|---|
| `normal` | on write | no | no | no |
| `sensitive` | always | on export | on export/edit | no |
| `critical` | always | yes | yes | workflow-defined |

A permission may override any default explicitly (e.g. `medical_records.view`
is `sensitive` yet audits on read because it is PHI).

---

## 6. Feature Flags / بوابات الميزات

Flags gate entire product surfaces; they decouple capability from
authorization.

### 6.1 Catalog

`ClinicalWorkflow`, `Inventory`, `HR`, `Payroll`, `Marketing`, `AI`,
`WhatsApp`, `SMS`, `OnlineBooking`, `Telemedicine`.

### 6.2 Scopes & inheritance

| Scope | Owner |
|---|---|
| System | Platform operator (global kill switch). |
| Tenant | Clinic owner / SaaS admin. |
| Branch | Branch manager. |

```
effective(flag) = system(flag) AND tenant(flag) AND branch(flag)
```

### 6.3 Interaction with authorization

If `feature_flag` is not `null` and the effective flag is `false`, the
permission evaluates to **deny** regardless of the bundle. Registry
stays complete; runtime short-circuits.

---

## 7. Licensing Layer / طبقة الترخيص

Licensing is orthogonal to authorization:

```
License → Feature Flags → Permissions
الترخيص ← بوابات الميزات ← الصلاحيات
```

### 7.1 Reference plans

| Plan | Feature Flags |
|---|---|
| Starter | ClinicalWorkflow (basic), OnlineBooking |
| Professional | Starter + Inventory, HR, Payroll, Marketing, SMS |
| Enterprise | Professional + AI, WhatsApp, Telemedicine, advanced Compliance |

### 7.2 Gating

`required_license` on the permission = lowest tier that unlocks it.
Upgrades enable flags; downgrades disable permissions gracefully without
deleting bundle entries.

---

## 8. Enterprise Audit Framework / إطار التدقيق

### 8.1 Event schema

| Field | Description |
|---|---|
| `actor_user_id` | Acting user. |
| `actor_role` | Primary role at action time. |
| `branch_id` | Branch scope. |
| `tenant_id` | Tenant scope. |
| `permission_id` | Registry key checked. |
| `action` | Verb performed. |
| `target_type` | Table/resource. |
| `target_id` | Row id. |
| `old_value` | JSON snapshot before. |
| `new_value` | JSON snapshot after. |
| `reason` | Required on critical. |
| `approval_id` | Workflow reference. |
| `session_id` | Auth session. |
| `ip_address` | Source IP. |
| `device` | Device fingerprint. |
| `browser` | UA browser. |
| `operating_system` | UA OS. |
| `timestamp` | UTC ISO8601. |
| `outcome` | success/failure. |
| `geo_location` | Optional. |

### 8.2 Immutability

- INSERT-only, no UPDATE/DELETE.
- Append-only storage; retention is policy-driven.
- Reads of critical records are themselves audited.
- Optional hash-chain (roadmap Phase 7) for tamper evidence.

---

## 9. Compliance Framework / إطار الامتثال

V4 renames the V3 "Auditor" role to **Compliance Officer** — `مسؤول الامتثال`.

### 9.1 Responsibilities

- Continuous monitoring of audit and access logs.
- Producing compliance reports (HIPAA-style, GDPR-style, regional).
- Investigating incidents; producing incident reports.
- Approving retention/export policies.
- Signing off risk assessments before PHI-touching launches.

### 9.2 Access surface (read-only)

| Surface | Access |
|---|---|
| Audit logs | read |
| Compliance reports | read + export |
| Risk reports | read + export |
| Incident reports | read + export |
| Other business data | none |

The Compliance Officer cannot write business data or grant permissions;
they file findings the Super Admin or System Owner acts on.

---

## 10. Enterprise Permission Registry Standard

Canonical shape for every registry entry:

```yaml
- id: <group>.<verb>[.<qualifier>]
  english_label: <string>
  arabic_label: <string>
  module: <Clinical|Finance|HR|Inventory|Communication|Reports|Settings|Governance|SaaS>
  category: <string>
  classification: <normal|sensitive|critical>
  conditions: [<Condition>, ...]
  dependencies:
    requires: [<id>, ...]
    implies: [<id>, ...]
    conflicts_with: [<id>, ...]
  required_license: <Starter|Professional|Enterprise|null>
  feature_flag: <FlagName|null>
  audit_required: <bool>
  mfa_required: <bool>
  approval_required: <bool>
  deprecated: <bool>
  description: <string>
```

### 10.1 Full worked example

```yaml
- id: payroll.run
  english_label: Run Payroll
  arabic_label: تشغيل الرواتب
  module: HR
  category: payroll
  classification: critical
  conditions: [SameBranch, MFAAuthenticated, BusinessHours]
  dependencies:
    requires: [payroll.view]
    implies: [payroll.export]
    conflicts_with: []
  required_license: Professional
  feature_flag: Payroll
  audit_required: true
  mfa_required: true
  approval_required: true
  deprecated: false
  description: >
    Executes the monthly payroll batch for the current branch. Requires
    MFA, an approval ticket, and cannot run outside business hours.
```

### 10.2 Registry hygiene

- Unique `id`.
- Every `requires` / `conflicts_with` target exists in the registry.
- Every non-null `feature_flag` exists in the Flag catalog.
- `deprecated: true` entries stay one migration window, then are removed
  by a BA-versioned change.

---

## 11. Authorization Validation Rules / قواعد التحقق

| # | Rule | Enforcement |
|---|---|---|
| V01 | No `edit` without `view` | Dependency closure |
| V02 | No `delete` without `edit` + `view` | Dependency closure |
| V03 | No `approve` without `review` | Dependency closure |
| V04 | No `export` without `view` | Dependency closure |
| V05 | No cross-branch access for non-global roles | `SameBranch` on every non-global bundle |
| V06 | No critical permission without MFA | `classification=critical ⇒ mfa_required=true` |
| V07 | No critical permission without audit | `classification=critical ⇒ audit_required=true` |
| V08 | No hard delete on clinical data | No `.delete` on `medical_records`, `treatment_plans`, `exercises` |
| V09 | No hard delete on financial ledgers | No `.delete` on `payments`, `invoices`, `treasury_transactions` |
| V10 | No self-approval | `Reviewer`/`Approver` reject `actor==author` |
| V11 | Creator ≠ Approver | `conflicts_with` requester ↔ approver |
| V12 | Refund three-hand SoD | `refund_request` ↔ `refund_review` ↔ `refund_approve` mutually conflict |
| V13 | System Owner not in normal pickers | Bundle flag `governance_only=true` |
| V14 | Administrative Manager cannot `users.create` | Replaced by `users.request_creation` |
| V15 | Doctor cannot edit approved records | `ApprovedOnly` denies `edit` |
| V16 | Audit logs append-only | No `audit_logs.edit`/`.delete` |
| V17 | Compliance Officer read-only | Bundle has only `.view`/`.export` |
| V18 | Deprecated keys never appear in new bundles | Bundle CI diffs against `deprecated=true` |
| V19 | Feature-flagged permissions require the flag | Bundle validated against Flag catalog |
| V20 | Licensed permissions respect plan | Bundle × plan check per tenant |
| V21 | Every write produces one audit event | Runtime contract test |
| V22 | Every denial on sensitive/critical is logged | Runtime contract test |
| V23 | No permission granted to System Owner via UI | UI guard test |
| V24 | Registry entries are bilingual | Schema check on both labels |
| V25 | Reason required for critical writes | Runtime enforcement + audit `reason` non-null |

---

## 12. Authorization Maturity Model

| Level | Capability | PPP after V4 |
|---|---|---|
| L1 | Authentication | ✅ Achieved |
| L2 | RBAC | ✅ Achieved |
| L3 | Branch Isolation | ✅ Achieved |
| L4 | Workflow Authorization | ✅ Achieved (V3.1) |
| L5 | Separation of Duties | ✅ Achieved (V3.1) |
| L6 | ABAC | 🟡 Designed in V4 §3 (Phase 3) |
| L7 | Permission Dependencies | 🟡 Designed in V4 §4 (Phase 1) |
| L8 | Permission Classification | 🟡 Designed in V4 §5 (Phase 1) |
| L9 | Feature Flags | 🟡 Designed in V4 §6 (Phase 4) |
| L10 | Licensing | 🟡 Designed in V4 §7 (Phase 5) |
| L11 | Compliance | 🟡 Designed in V4 §9 (Phase 6) |
| L12 | Enterprise Governance | ⚪ Break-glass exists; full governance in Phase 7 |

**Position after V4 documentation adoption:** operationally at L5,
design-complete to L12, implementation roadmap defined in §13.

---

## 13. Future Roadmap / خارطة الطريق

### Phase 1 — Permission Registry
- Extend `authz_permissions` with V4 fields; backfill defaults.
- Ship dependency closure and conflict CI checks (V01–V04, V11, V12).

### Phase 2 — Role Bundles
- Rebuild bundles from V3.1 rules against the enriched registry.
- Validate every bundle with V01–V25.
- Bilingual UI labels sourced from the registry.

### Phase 3 — ABAC Engine
- Implement Condition Library as pure functions.
- Wire into the permission engine with per-condition telemetry.

### Phase 4 — Feature Flags
- System / Tenant / Branch scopes with inheritance.
- Gate registry permissions by flag; ship admin UI.

### Phase 5 — Licensing
- `Starter`, `Professional`, `Enterprise` plans.
- Bind plans → flags → permissions; upgrade/downgrade flows.

### Phase 6 — Compliance
- Rename Auditor → Compliance Officer in registry and UI.
- Compliance/risk/incident report surfaces (read-only).
- Retention policies + export approvals.

### Phase 7 — Enterprise Governance
- Break-glass with dual-control and time-boxing.
- Hash-chain audit for tamper evidence.
- Registry externalized via governance API for regulator review.

---

## 14. Change Report / تقرير التغييرات

### Files created
- `docs/auth/BUSINESS_AUTHORIZATION_V4_ENTERPRISE.md`

### Files modified
- None.

### Files untouched
- All source code (`src/**`), edge functions (`supabase/functions/**`),
  migrations, RLS policies, `SECURITY DEFINER` functions, generated
  types (`src/integrations/supabase/**`), authentication configuration,
  permission engine (`src/lib/authz/**`), React components, routes,
  hooks, services, tests.
- Existing authorization docs (V3, V3.1, V2 matrix).

### Risks for future implementation
1. **Metadata backfill.** Extending `authz_permissions` must ship with
   safe defaults so pre-migration reads never deny legitimate traffic.
2. **Condition performance.** ABAC conditions must not add per-request
   DB round-trips beyond existing RLS.
3. **Feature-flag cascade.** Disabling a flag must not orphan in-flight
   workflows; provide a read-only fallback.
4. **License downgrade.** Removed permissions should degrade to `view`
   where safe and be surfaced clearly in the UI.
5. **Deprecation window.** Any V3 → V4 rename (Auditor → Compliance
   Officer) needs a bundle migration + parity harness before removal.
6. **Audit volume.** Auditing every sensitive read will substantially
   increase log volume; size storage/retention before Phase 1.
7. **SoD tightening.** `conflicts_with` may break existing bundles that
   colocate refund verbs; run a parity simulation before cut-over.
8. **Break-glass abuse.** System Owner is powerful; dual-control and
   time-boxing (Phase 7) are prerequisites for production trust.

### Future implementation notes
- Each phase must be preceded by a BA-versioned migration entry
  (`docs/execution/BA01/*`) and a rollback plan.
- CI rules V01–V25 should be added incrementally under `scripts/authz/`
  and gated on the existing `run_all.sh` harness.
- Bilingual labels are canonical in the registry; UI must never
  hard-code permission translations.
- Every ABAC condition ships with unit tests that assert deny/allow
  parity against the pre-ABAC baseline before being enabled at runtime.

---

**End of document.** V4 is design-complete and ready for phased
implementation per §13. No runtime behavior changes result from this
file.
