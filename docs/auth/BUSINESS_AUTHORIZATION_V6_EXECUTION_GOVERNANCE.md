# Business Authorization V6 — Execution & Governance Layer
# نموذج الصلاحيات — الإصدار السادس — طبقة التنفيذ والحوكمة

> **Status:** Documentation only. Fully backward-compatible with V3,
> V3.1, V4, and V5. **No** code, schema, RLS, DEFINER, edge function,
> authentication, permission-engine, types, enum, API, component, route,
> hook, service, migration, or test changes are performed by this
> document.
>
> **الحالة:** توثيق فقط. متوافق تمامًا مع الإصدارات السابقة.

V6 defines the **Governance Layer** that surrounds the V3–V5
authorization stack. It answers *how* authorization is governed,
monitored, versioned, analyzed, audited, validated, and evolved over
time. It is an enterprise governance architecture, not an
implementation.

---

## Table of Contents / الفهرس

1. Authorization Decision Logs
2. Authorization Explainability
3. Authorization Health Monitor
4. Bundle Optimizer
5. Permission Usage Analytics
6. Authorization Migration Assistant
7. Security Recommendation Engine
8. Tenant Authorization Templates
9. Policy Testing Framework
10. Authorization Playground
11. Governance Approval Workflow
12. Authorization Version Registry
13. Continuous Compliance Checker
14. Runtime Policy Engine
15. AI Authorization Advisor
16. Governance Dashboard
17. Governance KPIs
18. Governance Lifecycle
19. Enterprise Governance Principles
20. Change Report

Each chapter follows the same skeleton:
**English title / Arabic title → Purpose → Architecture → Rules →
Examples → Future implementation notes.**

---

## 1. Authorization Decision Logs / سجلات قرارات الصلاحيات

### Purpose / الغرض
Every authorization evaluation — allow or deny — MUST emit a structured
**Decision Record**. Decision logs are distinct from **Audit Logs**:
audit logs describe *state changes on business data*, decision logs
describe *what the authorization engine decided and why*.

| Aspect | Decision Log | Audit Log |
|---|---|---|
| Trigger | Every permission check | Every state-changing action |
| Volume | High (reads + writes) | Medium (writes only) |
| Retention | 90 days hot, 1 year cold (default) | 7 years (compliance) |
| Purpose | Debugging, analytics, SoD | Legal, forensic, regulatory |
| Mutability | Append-only, TTL-eligible | Append-only, immutable |

### Architecture

```
 Request ─▶ Engine ─▶ Decision ─▶ decision_log (append-only)
                          │
                          └─▶ audit_log (only if state changed)
```

### Record schema

| Field | Type | Notes |
|---|---|---|
| `decision_id` | uuid | ULID/UUIDv7 preferred |
| `user_id` | uuid | Actor |
| `tenant_id` | uuid | Tenant scope |
| `branch_id` | uuid \| null | Branch scope |
| `permission_requested` | string | Raw ask |
| `permission_resolved` | string | Post-implication resolution |
| `role_source` | string | Role that granted / would grant |
| `bundle_version` | string | e.g. `bundle:doctor@v14` |
| `feature_flag_result` | enum | `allow \| deny \| n/a` |
| `license_result` | enum | `allow \| deny \| n/a` |
| `abac_result` | enum | `allow \| deny \| n/a` |
| `workflow_result` | enum | `allow \| deny \| n/a` |
| `rls_result` | enum | `allow \| deny \| n/a` |
| `final_decision` | enum | `allow \| deny` |
| `deny_stage` | enum | `auth \| tenant \| branch \| license \| flag \| role \| perm \| dep \| abac \| workflow \| approval \| rls` |
| `deny_reason` | string | Human-readable |
| `latency_ms` | int | Total pipeline latency |
| `timestamp` | timestamptz | UTC |
| `session_id` | uuid | Auth session |
| `request_id` | string | Correlates with edge/API logs |

### Rules

- Append-only. No UPDATE, no DELETE (TTL only).
- MUST NOT contain PHI/PII payloads — permission ids and target types
  only.
- MUST correlate with `audit_log.decision_id` when a state change follows.
- Latency budget: writing the decision record MUST be ≤ 2 ms p95 and
  MUST NOT block the response.

### Example

```json
{
  "decision_id": "01JABZ...",
  "user_id": "u_123",
  "tenant_id": "t_9",
  "branch_id": "b_2",
  "permission_requested": "medical_records.approve",
  "permission_resolved": "medical_records.approve",
  "role_source": "MedicalDirector",
  "bundle_version": "bundle:medical_director@v7",
  "feature_flag_result": "allow",
  "license_result": "allow",
  "abac_result": "deny",
  "workflow_result": "n/a",
  "rls_result": "n/a",
  "final_decision": "deny",
  "deny_stage": "abac",
  "deny_reason": "SubmittedOnly failed: record status=draft",
  "latency_ms": 3,
  "timestamp": "2026-07-12T09:14:22Z"
}
```

### Future implementation notes
- Ship behind a sampling flag before general availability.
- Partition by day and tenant.
- Cold-tier to object storage after 90 days.

---

## 2. Authorization Explainability / قابلية تفسير القرارات

### Purpose / الغرض
Any denial MUST be explainable in plain language. The engine exposes an
`Explain(request)` capability that returns *why* a decision was made,
not just *what* it was.

### Architecture

```
 Explain(request)
   ├─ Missing permission?
   ├─ Failed ABAC condition?
   ├─ Disabled feature flag?
   ├─ License restriction?
   ├─ Workflow / approval blocker?
   ├─ Policy restriction?
   └─ RLS restriction?
 → { stage, human_reason_en, human_reason_ar, remediation }
```

### Rules
- Bilingual output (EN + AR).
- Never leak internal role names of *other* users.
- MUST reference the stable permission id and the failing condition id.
- Provide a `remediation` string when the fix is a user action (e.g. "Ask
  a Branch Manager to approve refund").

### Example

```
Requested: payments.refund_approve
Decision:  deny @ stage=abac
EN: You are the cashier who requested this refund. Refund approval
    requires a different Branch Manager (three-hand SoD).
AR: لا يمكن اعتماد الاسترداد من قبل نفس الشخص الذي طلبه. يجب أن يعتمده
    مدير فرع آخر (فصل المهام الثلاثي).
Remediation: Route the refund to the on-duty Branch Manager.
```

### Future implementation notes
- Explain() reads the last decision record when available, otherwise
  re-runs the pipeline in dry-run mode.
- Surface in admin UI and in developer devtools.

---

## 3. Authorization Health Monitor / مراقب سلامة الصلاحيات

### Purpose / الغرض
Continuous scanner that keeps the registry, bundles, and runtime in a
healthy state.

### Detects

| Class | Signal |
|---|---|
| Registry hygiene | Missing module / description / classification / bilingual label |
| Registry drift | Runtime permission not in registry (and vice versa) |
| Deprecated usage | Deprecated permission still granted |
| Dependency graph | Broken `requires`, circular `implies`, orphan `conflicts_with` |
| Bundle hygiene | Unused bundles, oversized bundles, duplicate bundles |
| Role hygiene | Unused roles, roles with zero users, roles with zero permissions |
| Permission usage | Permissions never used in N days |
| Drift | Permission drift, bundle drift, registry drift |

### Architecture

```
 Nightly job
   ├─ Load registry snapshot
   ├─ Load bundle snapshot
   ├─ Load decision_log aggregates (N days)
   └─ Emit health_report
        ├─ severity: info|warn|error
        ├─ finding_id
        └─ suggested_action
```

### Rules
- Read-only. Never mutates bundles or registry.
- Every finding has a stable `finding_id` so dashboards can dedupe.
- Findings feed the Governance Dashboard (§16) and the AI Advisor (§15).

### Example finding

```yaml
finding_id: HM-2026-07-12-014
severity: warn
category: unused_permission
permission: reports.legacy_export
observed_days: 180
recommendation: mark deprecated in next BA cycle
```

### Future implementation notes
- Ship as a scheduled edge function reading materialized views.
- Emit metrics to the KPI store (§17).

---

## 4. Bundle Optimizer / محسّن الحزم

### Purpose / الغرض
Analyze real usage from decision logs and recommend bundle changes that
reduce privilege without breaking workflows.

### Suggestions

- Remove unused permissions from a bundle.
- Split oversized bundles (e.g. > 40 permissions) into role sub-profiles.
- Merge duplicate bundles (≥ 95% overlap).
- Reduce privilege where `sensitive`/`critical` permissions are unused.

### Before / after example

```
bundle: receptionist (v11) — 22 permissions
  observed usage (90d): 14 permissions
  suggestion → v12 removes 8 unused, adds none

bundle: cashier (v9)  ⟷  bundle: front_desk_cashier (v3)
  overlap: 96%
  suggestion → merge into cashier@v10, retire front_desk_cashier
```

### Rules
- Suggestions only. Never auto-apply.
- Every suggestion produces a Migration Assistant impact report (§6).

### Future implementation notes
- Run weekly.
- Feed into Approval Workflow (§11).

---

## 5. Permission Usage Analytics / تحليلات استخدام الصلاحيات

### Purpose / الغرض
Fleet-wide analytics for authorization behavior.

### Dimensions

| Cut | Example question |
|---|---|
| Top N | Which permissions fire most? |
| Least used | Which permissions haven't fired in 90d? |
| Most denied | Where are users hitting walls? |
| Most dangerous | Which `critical` permissions fire, by whom? |
| Most exported | Where is data leaving the system? |
| Most approved | Which workflows carry approvals? |
| Trend | Weekly deltas per permission |
| Heatmap | Permission × role, permission × branch |

### Slicing
- Per module, per tenant, per branch, per role, per user cohort.

### Architecture

```
 decision_log ─▶ hourly rollup ─▶ analytics_permission_usage
                             ─▶ analytics_denials
                             ─▶ analytics_exports
```

### Rules
- Aggregates only. No individual-user profiling in dashboards without
  Compliance Officer role.
- Retention aligned with decision-log tiering.

### Future implementation notes
- Expose as read-only widgets in the Governance Dashboard.

---

## 6. Authorization Migration Assistant / مساعد ترحيل الصلاحيات

### Purpose / الغرض
Before publishing a bundle, registry, or policy change, produce an
**impact report**.

### Report contents

- Affected users (count and sample)
- Affected roles
- Affected APIs / edge functions
- Affected UI surfaces / routes
- Affected workflows and approvals
- Affected reports and exports
- Estimated risk score (0–100)
- Rollback plan (BA-XXX rollback SQL / bundle diff)

### Rules
- No change reaches "Publish" (§11) without an attached impact report.
- Reports are archived with the BA-XXX entry (§12).

### Example

```
Change: bundle:cashier v9 → v10 (adds payments.refund_request)
Impact:
  users:     47
  branches:  6
  workflows: refund three-hand SoD
  routes:    /payments, /treasury/daily-close
  risk:      22/100 (additive, non-critical)
  rollback:  revert to v9 via BA-104 rollback bundle
```

### Future implementation notes
- Runs synchronously on Draft → Review transition.

---

## 7. Security Recommendation Engine / محرك التوصيات الأمنية

### Purpose / الغرض
Identify risky bundle compositions and recommend mitigations. Never
auto-modify.

### Risky patterns

| Pattern | Reason |
|---|---|
| Too many `critical` permissions in one bundle | Blast radius |
| `.delete` + `.approve` in the same bundle | SoD violation |
| Treasury + Payroll | Financial SoD |
| Clinical + Financial | Cross-domain risk |
| Creator + Approver on same workflow | SoD violation |
| Bundle with export permissions but no MFA | PHI leak risk |

### Output

```yaml
recommendation_id: SR-2026-07-12-003
bundle: multi_role_manager@v4
severity: high
finding: contains payments.refund_request AND payments.refund_approve
action: split into two bundles OR remove refund_approve
```

### Rules
- Recommendations require human approval to act on.
- Feed into Approval Workflow (§11).

---

## 8. Tenant Authorization Templates / قوالب صلاحيات المستأجرين

### Purpose / الغرض
Ship curated default bundles per tenant archetype.

### Templates

| Template | Roles included (default) |
|---|---|
| Small Clinic / عيادة صغيرة | Owner, Doctor, Receptionist, Cashier |
| Large Clinic / عيادة كبيرة | + Branch Manager, Accountant, HR |
| Hospital / مستشفى | + Medical Director, Compliance Officer, IT Admin |
| Government / جهة حكومية | + Regulator (read-only), Auditor |
| Enterprise / مؤسسة | Full RBAC + ABAC + Feature Flags |
| University / جامعة | + Educator, Student Clinician (supervised) |
| Chain Clinics / سلسلة عيادات | + Regional Manager, Cross-branch Accountant |
| Multi-region / متعدد المناطق | + Regional Compliance, Data Residency policies |

### Rules
- Templates are versioned like bundles.
- Tenants may customize, but customization creates a new BA-XXX entry.

---

## 9. Policy Testing Framework / إطار اختبار السياسات

### Purpose / الغرض
Given/When/Then testing over the full authorization pipeline.

### Test types

| Type | Description |
|---|---|
| Golden | Baseline decisions that MUST NOT change |
| Regression | Prior bugs, encoded as tests |
| Negative | Denials that MUST remain denied |
| Conflict | SoD `conflicts_with` invariants |

### Example

```gherkin
Given user "u_cashier" with role "Cashier" in branch "b_2"
When they request "payments.refund_approve" on invoice "i_9"
Then decision is "deny"
And deny_stage is "role"
And explain contains "requires role Branch Manager"
```

### Rules
- Every BA-XXX change MUST attach the golden diff.
- Test suite runs in CI, blocks Publish on failure.

---

## 10. Authorization Playground / منصة تجربة الصلاحيات

### Purpose / الغرض
Interactive simulator for admins and developers.

### Inputs
User · Role · Permission · Resource · Branch · Tenant · Feature Flags ·
License.

### Output
Complete pipeline trace:

```
 1. auth        ✔ authenticated
 2. tenant      ✔ t_9
 3. branch      ✔ b_2
 4. license     ✔ Professional
 5. feature     ✔ ClinicalWorkflow
 6. role        ✔ Doctor
 7. permission  ✔ medical_records.edit
 8. dependency  ✔ requires medical_records.view (granted)
 9. abac        ✘ DraftOnly failed (status=approved)
10. workflow    ─
11. approval    ─
12. rls         ─
FINAL: deny @ abac
```

### Rules
- Playground runs read-only; never mutates.
- Available to Super Admin and Compliance Officer.

---

## 11. Governance Approval Workflow / سير عمل موافقات الحوكمة

### Purpose / الغرض
No authorization change is published directly.

### Stages

```
 Draft ─▶ Review ─▶ Security Review ─▶ Approval ─▶ Publish
                                                    │
                                                    ├─▶ Rollback Point
                                                    └─▶ Archive
```

| Stage | Owner | Exit criteria |
|---|---|---|
| Draft | Author | Impact report attached |
| Review | Peer | Policy tests green |
| Security Review | Security / Compliance | SR findings resolved |
| Approval | Super Admin | Sign-off recorded |
| Publish | Release Manager | Rollback plan verified |
| Rollback Point | System | Snapshot pinned |
| Archive | System | Immutable BA-XXX entry |

### Rules
- Every stage transition is audited.
- Emergency Break-Glass (V4 §Governance) uses a compressed variant with
  post-hoc review within 24h.

---

## 12. Authorization Version Registry / سجل إصدارات الصلاحيات

### Purpose / الغرض
Every governance change receives a stable identifier.

### ID scheme
`BA-<seq>` — e.g. `BA-001`, `BA-002`, `BA-003`.

### Entry fields

| Field | Notes |
|---|---|
| `id` | BA-XXX |
| `author` | User |
| `reviewer` | User |
| `approver` | Super Admin |
| `date` | UTC |
| `risk` | low / med / high |
| `rollback` | SQL / bundle diff link |
| `affected_bundles` | List |
| `affected_permissions` | List |
| `affected_policies` | List |
| `impact_report` | Link |
| `golden_diff` | Link |

### Rules
- Registry is append-only.
- IDs never reused.

---

## 13. Continuous Compliance Checker / مدقق الامتثال المستمر

### Purpose / الغرض
Automated validation against regulatory frameworks.

### Frameworks
HIPAA · GDPR · ISO 27001 · SOC 2 · Regional healthcare regulations.

### Checks (samples)

| Framework | Check |
|---|---|
| HIPAA | Every PHI read audited |
| GDPR | Export requires reason + retention tag |
| ISO 27001 | SoD enforced on critical workflows |
| SOC 2 | Change management via BA-XXX with approver ≠ author |
| Regional | Data residency respected per tenant |

### Output
- Compliance score per framework.
- Violation list with severity and BA-XXX remediation suggestion.
- Exportable compliance report (Compliance Officer only).

---

## 14. Runtime Policy Engine / محرك السياسات الديناميكي

### Purpose / الغرض
Turn tunable policy values into configuration, editable without a
redeploy.

### Configurable policies (examples)

| Policy | Default | Scope |
|---|---|---|
| Business Hours | 08:00–20:00 | Branch |
| Maximum Export Size | 10,000 rows | Tenant |
| Maximum Refund | 5,000 SAR | Branch |
| Doctor Edit Window | 24 h after creation | Tenant |
| Session Lifetime | 12 h | Tenant |
| MFA Grace Period | 5 min | Tenant |

### Rules
- Policy changes go through Approval Workflow (§11) and get a BA-XXX id.
- Runtime reads policies from a cached table; TTL ≤ 60 s.

---

## 15. AI Authorization Advisor / المستشار الذكي للصلاحيات

### Purpose / الغرض
Future AI assistant that mines decision logs, health findings, and
security recommendations to propose changes.

### Suggests
- Permission cleanup
- Role optimization
- Unused permission removal
- Security improvements
- SoD violations
- Bundle refactors

### Rules
- Every suggestion carries an explanation.
- Human approval REQUIRED. AI cannot auto-apply.
- Suggestions enter the Approval Workflow as Drafts.

---

## 16. Governance Dashboard / لوحة حوكمة الصلاحيات

### Purpose / الغرض
Single pane of glass for the governance team.

### Widgets

- Decision Logs (live tail + filters)
- Denied Requests (top reasons)
- Risk Score (per bundle / tenant)
- Compliance (per framework)
- Security Score
- Policy Violations
- Bundle Versions (active vs pending)
- Emergency (Break-Glass) Sessions
- Feature Flags (per scope)
- Licenses (per tenant)
- KPIs (§17)

### Rules
- Read-only; actions route through Approval Workflow.
- Role-gated: Super Admin, Compliance Officer, Security Officer.

---

## 17. Governance KPIs / مؤشرات أداء الحوكمة

| KPI | Target |
|---|---|
| Authorization latency (p95) | ≤ 15 ms |
| Approval SLA (Draft → Publish) | ≤ 5 business days |
| Denied ratio | ≤ 3% of total checks |
| Permission utilization | ≥ 80% of registry active |
| Unused permissions (90d) | ≤ 10% |
| Policy violations | 0 open critical |
| Emergency sessions | ≤ 2 / month |
| Compliance score | ≥ 95% per framework |
| Security score | ≥ 90% |
| Bundle quality score | ≥ 85% |
| Risk trend | Monotonically ↓ QoQ |

### Rules
- KPIs published monthly.
- Missed targets require a BA-XXX remediation.

---

## 18. Governance Lifecycle / دورة حياة الحوكمة

```
 Design ─▶ Review ─▶ Approve ─▶ Publish ─▶ Monitor ─▶ Optimize ─▶ Deprecate ─▶ Retire
```

| Stage | Artifact |
|---|---|
| Design | Draft BA-XXX |
| Review | Peer + Security sign-off |
| Approve | Super Admin sign-off |
| Publish | Bundle/registry version activated |
| Monitor | Decision logs + KPIs |
| Optimize | Bundle Optimizer + AI Advisor |
| Deprecate | Marked `deprecated: true` |
| Retire | Removed after grace window |

### Rules
- Everything version-controlled via BA-XXX.
- No stage is skippable except in Break-Glass (post-hoc review).

---

## 19. Enterprise Governance Principles / مبادئ الحوكمة المؤسسية

| # | Principle | المبدأ |
|---|---|---|
| G1 | Least Privilege | الحد الأدنى من الصلاحيات |
| G2 | Zero Trust | انعدام الثقة الافتراضي |
| G3 | Defense in Depth | الدفاع متعدد الطبقات |
| G4 | Separation of Duties | فصل المهام |
| G5 | Explainability | قابلية التفسير |
| G6 | Auditability | قابلية التدقيق |
| G7 | Observability | قابلية المراقبة |
| G8 | Deterministic Decisions | قرارات حتمية |
| G9 | Backward Compatibility | التوافق العكسي |
| G10 | Versioned Governance | حوكمة مُصدَّرة |

All V3–V5 principles remain in force; V6 principles extend, never
contradict them.

---

## 20. Change Report / تقرير التغييرات

### Files created
- `docs/auth/BUSINESS_AUTHORIZATION_V6_EXECUTION_GOVERNANCE.md`

### Files modified
- None.

### Files untouched
- All source code, edge functions, migrations, RLS policies, DEFINER
  functions, generated Supabase types, authentication configuration,
  permission engine, React components, routes, hooks, services, tests,
  and prior authorization documents (V3, V3.1, V4, V5).

### Risks for future implementation
1. **Decision-log volume.** High-cardinality logs need partitioning and
   TTL from day one.
2. **Latency budget.** Explainability must not add > 1 ms p95 to the
   main pipeline.
3. **Dashboard access.** Governance widgets expose sensitive posture;
   gate strictly on Compliance/Security roles.
4. **AI Advisor trust.** Never allow auto-apply; require BA-XXX approval.
5. **Policy engine cache.** Stale policy values could break SoD;
   enforce short TTL and invalidation on publish.
6. **Template drift.** Tenant templates must be versioned or tenants
   silently diverge.
7. **Compliance scope creep.** Adding frameworks increases false
   positives; tune per tenant jurisdiction.

### Future roadmap
- Phase 1: Decision Logs + Explainability (§1, §2).
- Phase 2: Health Monitor + Migration Assistant (§3, §6).
- Phase 3: Approval Workflow + Version Registry (§11, §12).
- Phase 4: Analytics + Dashboard + KPIs (§5, §16, §17).
- Phase 5: Policy Engine + Templates (§14, §8).
- Phase 6: Compliance Checker (§13).
- Phase 7: AI Advisor (§15).

---

**End of document.** V6 is **governance-complete** and does **not**
change runtime behavior. All runtime, schema, RLS, DEFINER, edge
function, authentication, and permission-engine behavior remains
identical to V5 until future implementation phases are scheduled and
approved via the Governance Approval Workflow defined here.