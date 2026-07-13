# Business Authorization V7 — Policy, Context & Relationship Engine
# نموذج الصلاحيات — الإصدار السابع — محرك السياسات والسياق والعلاقات

> **Status:** Documentation only. No runtime changes. No implementation.
> Fully backward-compatible with V3, V3.1, V4, V5, V6.
>
> **الحالة:** توثيق فقط. لا تغييرات وقت تشغيل. لا تنفيذ.

---

## Table of Contents / الفهرس

1. Relationship-Based Access Control (ReBAC)
2. Resource Authorization
3. Ownership Model
4. Enterprise Context Engine
5. Enterprise Policy Language
6. Policy Compiler Architecture
7. Policy Optimizer
8. Policy Versioning
9. Continuous Authorization
10. Risk Engine
11. Adaptive Authorization
12. Device Trust Model
13. Geo Authorization
14. Delegation Engine
15. Just-In-Time Authorization
16. PDP / PEP Enterprise Architecture
17. Enterprise Authorization API
18. Cross-Service Authorization
19. Identity Federation
20. Change Report

---

## Preface / تمهيد

V7 extends the V3–V6 authorization stack with three orthogonal engines
layered above the existing RBAC + ABAC + Workflow + Governance model:

- **Relationships** — *who is connected to what*
- **Context** — *what is true right now*
- **Policy** — *what the enterprise has declared*

V7 never redefines V3–V6 constructs. Every V7 concept degrades cleanly
to a V6-compatible evaluation when the new engines are not enabled.

```
┌──────────────────────────────────────────────────────────────┐
│  V7 — Policy · Context · Relationships                       │
├──────────────────────────────────────────────────────────────┤
│  V6 — Execution & Governance                                 │
│  V5 — Implementation Architecture                            │
│  V4 — Enterprise Framework (ABAC, Classification, Flags)     │
│  V3.1 — SoD Refinements                                      │
│  V3  — Business Authorization Baseline                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Relationship-Based Access Control (ReBAC) / التحكم القائم على العلاقات

**English title:** Relationship-Based Access Control
**Arabic title:** التحكم في الوصول القائم على العلاقات

### 1.1 Purpose / الغرض

RBAC answers *who is the user*. ABAC answers *what is the context*.
ReBAC answers *how is the user connected to this specific resource*.
In a clinical SaaS, most sensitive decisions are relational: a doctor
may view **their** patient's record, a manager may approve **their**
branch's refund, a reviewer may sign **their assigned** medical note.

### 1.2 Architecture / البنية

A directed relationship graph over first-class subjects and objects.

```
 (User: Dr. Sara) ──assigned_doctor──▶ (Patient: #P-1042)
        │                                     │
        │                                     └──has_record──▶ (MedicalRecord: #MR-88)
        └──member_of──▶ (Branch: Riyadh) ◀──scoped_to── (Invoice: #INV-201)

 (User: Manager)  ──manages──▶ (Branch: Riyadh) ──contains──▶ (User: Cashier)
```

Supported relationship classes:

| Class | Examples |
|---|---|
| Clinical | `assigned_doctor`, `treating_therapist`, `reviewer`, `medical_director_of` |
| Organizational | `member_of_branch`, `manages_branch`, `member_of_department`, `reports_to` |
| Custodial | `owner_of`, `created_by`, `responsible_for`, `delegated_to` |
| Workflow | `requested_by`, `reviewed_by`, `approved_by` |
| Familial | `parent_of`, `guardian_of` (pediatric physiotherapy) |

### 1.3 Rules / القواعد

- R1. Relationships are **directed** and **typed**.
- R2. A permission may declare required relationship(s) to the target.
- R3. Missing relationship on a resource-scoped check = **deny**.
- R4. Relationships are auditable; edits produce audit events.
- R5. Transitive closure is bounded (max depth = 3) to preserve latency.
- R6. Relationships never bypass V3 branch isolation or V4 classification.

### 1.4 Examples / أمثلة

```yaml
- id: medical_records.view
  relationships:
    any_of:
      - assigned_doctor(user, record.patient)
      - reviewer(user, record)
      - medical_director_of(user, record.branch)

- id: invoices.approve
  relationships:
    all_of:
      - manages_branch(user, invoice.branch)
    none_of:
      - created_by(user, invoice)
```

### 1.5 Future Implementation Notes / ملاحظات

- Store relationships in a dedicated graph-style table with `(subject,
  predicate, object, tenant_id, branch_id, valid_from, valid_to)`.
- Cache relationship lookups per session; invalidate on write.
- Never infer clinical relationships from names or heuristics.

---

## 2. Resource Authorization / صلاحيات على مستوى المورد

**English title:** Resource-Level Authorization
**Arabic title:** الصلاحيات على مستوى المورد

### 2.1 Purpose

Move decisions from "can the user use the Invoices module" to "can this
specific user perform this specific action on **this specific invoice**".

### 2.2 Architecture

```
 Request ──▶ (module.action)──▶ (resource_type)──▶ (resource_id)
                                                       │
                                                       ▼
                                          load resource attributes
                                                       │
                                                       ▼
                                      evaluate relationships + ABAC + policy
```

Every V7 check carries `(permission_id, resource_type, resource_id?)`.
When `resource_id` is absent, the engine falls back to V4 branch/ABAC
scope — preserving V6 compatibility.

### 2.3 Rules

| # | Rule |
|---|---|
| RA1 | Resource-scoped permissions declare `resource_type`. |
| RA2 | The engine loads the minimal attribute projection required. |
| RA3 | Resource state (draft/submitted/approved) participates. |
| RA4 | Missing resource = deny (fail-closed). |
| RA5 | Bulk actions decompose into per-resource checks. |

### 2.4 Examples

| Resource | Action | Relational Gate | State Gate |
|---|---|---|---|
| Invoice | edit | manages_branch OR created_by | not `paid`, not `void` |
| Patient | export | assigned_doctor OR compliance | `active` |
| Appointment | reschedule | assigned_therapist OR receptionist(branch) | not `completed` |
| Prescription | sign | prescribing_doctor(record) | `draft` |
| Medical Record | amend | author AND within 24h | `approved` |

### 2.5 Future Implementation Notes

- Introduce a `ResourceDescriptor` registry describing loaders per type.
- Batch resource loads to avoid N+1 lookups on list views.

---

## 3. Ownership Model / نموذج الملكية

**English title:** Ownership & Custody Model
**Arabic title:** نموذج الملكية والعهدة

### 3.1 Purpose

Ownership is a specialized relationship that governs default rights,
SoD, and delegation. V7 formalizes the ownership vocabulary already
used implicitly across V3–V6.

### 3.2 Ownership Types

| Type | Meaning | Rights (default) |
|---|---|---|
| `created_by` | Originator | read; edit while `draft` |
| `assigned_to` | Active custodian | read; edit within workflow state |
| `responsible_user` | Long-lived owner (case manager) | read; comment; escalate |
| `approver` | Terminal decision maker | read; approve; reject |
| `reviewer` | Intermediate signer | read; review; return |
| `delegated_user` | Time-boxed proxy | inherit granted subset (§14) |

### 3.3 Rules

- O1. Ownership is additive; multiple owners of different types may coexist.
- O2. Ownership inherits along `branch → department → team` where declared.
- O3. Ownership never crosses tenants.
- O4. Ownership transfer is audit-logged with `from`, `to`, `reason`.
- O5. `created_by` is immutable.

### 3.4 Inheritance Diagram

```
 Tenant
   └─ Branch (manager: M1)
        └─ Department (head: D1)
             └─ Team (lead: T1)
                  └─ Resource  ── owner: assigned_to = U1
                                   ── reviewer:      = R1
                                   ── approver:      = A1
```

### 3.5 Future Implementation Notes

- Represent ownership as typed edges in the relationship graph (§1).
- Ownership transfer is a governed workflow, not a silent update.

---

## 4. Enterprise Context Engine / محرك السياق المؤسسي

**English title:** Enterprise Context Engine
**Arabic title:** محرك السياق المؤسسي

### 4.1 Purpose

Authorization depends on facts that are true *at request time*. The
Context Engine collects, normalizes, and exposes those facts to the
Policy Compiler and ABAC layer without leaking implementation detail.

### 4.2 Context Dimensions

| Dimension | Examples |
|---|---|
| Organizational | `tenant_id`, `branch_id`, `department_id` |
| Temporal | `now_utc`, `local_time`, `working_hours`, `shift`, `business_calendar` |
| Spatial | `country`, `region`, `geo_point`, `on_premises` |
| Session | `session_id`, `session_age`, `mfa_age`, `impersonation` |
| Device | `device_id`, `device_trust`, `os`, `browser`, `rooted`, `managed` |
| Network | `ip`, `asn`, `vpn`, `tor`, `known_egress` |
| Workflow | `record_state`, `workflow_step`, `pending_approvals` |
| Risk | `risk_score`, `recent_denials`, `failed_auth_count` |

### 4.3 Architecture

```
 Request ─▶ Context Collector ─▶ Normalizer ─▶ Context Object (frozen)
                                                     │
                              ┌──────────────────────┼──────────────────┐
                              ▼                      ▼                  ▼
                        ABAC Conditions       Policy Compiler      Risk Engine
```

### 4.4 Rules

- C1. The Context Object is **immutable** for the duration of a request.
- C2. Missing context = safest interpretation (e.g. unknown geo = restricted).
- C3. Context collection MUST NOT perform additional privileged queries.
- C4. Context is redacted in audit logs per classification.

### 4.5 Future Implementation Notes

- Ship the Collector as a middleware step upstream of the PDP (§16).
- Provide a fixture-based Context Object for the Authorization Playground.

---

## 5. Enterprise Policy Language / لغة السياسات المؤسسية

**English title:** Enterprise Policy Language (EPL)
**Arabic title:** لغة السياسات المؤسسية

### 5.1 Purpose

A declarative, human-readable YAML dialect for expressing enterprise
authorization intent. EPL is *specification*, not code; the Compiler
(§6) is a future component that converts EPL into an evaluation tree.

### 5.2 Vocabulary

| Keyword | Meaning |
|---|---|
| `allow` | Grant if all conditions hold |
| `deny` | Explicit deny (wins over allow) |
| `when` | Positive precondition |
| `unless` | Negative precondition |
| `condition` | Named ABAC condition |
| `resource` | Target resource type / selector |
| `relationship` | Required relationship edge (§1) |
| `context` | Required context predicate (§4) |
| `require` | Composite obligation (e.g. `mfa`, `approval`, `reason`) |

### 5.3 Example Policies

```yaml
policy: refund_approval
description: Branch managers approve refunds within business hours with MFA
allow:
  permission: payments.refund_approve
  resource: Payment
  relationship:
    - manages_branch(user, payment.branch)
  unless:
    - relationship: created_by(user, payment)
    - relationship: reviewed_by(user, payment)
  when:
    - context: business_hours
    - context: mfa_age < 5m
  require:
    - reason
    - audit
```

```yaml
policy: phi_export_restriction
deny:
  permission: medical_records.export
  when:
    - context: geo.country not in tenant.allowed_countries
    - context: device_trust in [unknown, rooted]
```

### 5.4 Rules

- P1. `deny` beats `allow`.
- P2. Policies compose; final decision = ordered evaluation of matching policies.
- P3. Every policy carries `id`, `version`, `owner`, `english_label`, `arabic_label`.
- P4. EPL never expresses side effects — only decisions and obligations.

### 5.5 Future Implementation Notes

- EPL is stored in a governed registry (§8).
- No inline JS/SQL expressions are permitted inside policies.

---

## 6. Policy Compiler Architecture / معمارية مُصرِّف السياسات

**English title:** Policy Compiler Architecture
**Arabic title:** معمارية مُصرِّف السياسات

### 6.1 Purpose

Transform declarative EPL into a deterministic **evaluation tree** the
PDP (§16) can execute in constant, predictable time.

### 6.2 Logical Stages

```
 EPL Source
    │
    ▼
 [1] Lexical Validation      → bilingual labels, schema conformance
 [2] Reference Resolution     → permission ids, conditions, relationships
 [3] Semantic Validation      → SoD, dependencies, feature flags, license
 [4] Normalization            → canonical AND/OR/NOT form
 [5] Optimization             → constant folding, short-circuiting
 [6] Evaluation Tree Emit     → PDP-consumable, versioned artifact
```

### 6.3 Rules

- CP1. Compilation is pure and reproducible.
- CP2. Every compiled artifact carries the source policy hash.
- CP3. Unresolved references fail the compile, not the runtime.

### 6.4 Future Implementation Notes

- Compilation happens offline in CI and at policy activation time.
- Runtime never re-parses EPL; it loads compiled artifacts only.

---

## 7. Policy Optimizer / مُحسِّن السياسات

**English title:** Policy Optimizer
**Arabic title:** مُحسِّن السياسات

### 7.1 Purpose

Continuously analyze the policy corpus for hygiene and safety.

### 7.2 Detections

| Class | Definition | Action |
|---|---|---|
| Dead Policy | Never matched over N days | Warn → deprecate |
| Duplicate Policy | Semantically identical | Merge candidate |
| Shadowed Policy | Preceded by broader deny/allow | Warn |
| Conflicting Policy | Same input → opposite decisions | Block activation |
| Redundant Policy | Subsumed by another | Consolidate |

### 7.3 Rules

- OP1. Optimizer is advisory except on **conflicts** (blocking).
- OP2. Findings feed the Governance Approval workflow (V6).

### 7.4 Example Report

```
[SHADOWED]   refund_high_value_extra   → shadowed by refund_approval
[DEAD]       legacy_marketing_export   → 0 matches in 90d
[CONFLICT]   phi_export_allow_eu       ⇔ phi_export_restriction
```

### 7.5 Future Implementation Notes

- Optimizer runs both in CI and as a scheduled governance job.

---

## 8. Policy Versioning / إدارة إصدارات السياسات

**English title:** Policy Versioning
**Arabic title:** إدارة إصدارات السياسات

### 8.1 Purpose

Every policy is versioned, approvable, rollback-able, and diffable —
aligned with the V6 Authorization Version Registry.

### 8.2 Lifecycle

```
 draft ─▶ proposed ─▶ approved ─▶ active ─▶ superseded
                          │
                          └─▶ rejected
                                          active ─▶ rolled_back
```

### 8.3 Rules

| # | Rule |
|---|---|
| PV1 | Only `approved` versions can be activated. |
| PV2 | Only one `active` version per policy id per tenant. |
| PV3 | Rollback restores a prior `approved` version; never a `draft`. |
| PV4 | Diffs are bilingual and human-readable. |
| PV5 | Migration between versions runs through the V6 Migration Assistant. |

### 8.4 Future Implementation Notes

- Store policy source, compiled artifact, and lifecycle state atomically.

---

## 9. Continuous Authorization / التفويض المستمر

**English title:** Continuous Authorization
**Arabic title:** التفويض المستمر

### 9.1 Purpose

Authorization is not a one-time gate at login. Decisions must be
re-evaluated when the facts change.

### 9.2 Re-evaluation Triggers

| Trigger | Effect |
|---|---|
| Role change | Invalidate effective-permission cache for user |
| Bundle change | Invalidate for all users bound to bundle |
| License change | Recompute tenant permission surface |
| Feature flag change | Recompute affected permissions |
| Policy change | Reload compiled artifact cluster-wide |
| Session change (MFA, elevation) | Refresh context-bound decisions |
| Relationship change | Invalidate affected `(user, resource)` pairs |

### 9.3 Rules

- CA1. Re-evaluation MUST NOT block the current request path.
- CA2. In-flight critical workflows freeze on demoting changes and require re-consent.

### 9.4 Future Implementation Notes

- Emit invalidation events on an internal channel consumed by all PDPs.

---

## 10. Risk Engine / محرك المخاطر

**English title:** Runtime Risk Engine
**Arabic title:** محرك المخاطر في وقت التشغيل

### 10.1 Purpose

Produce a numeric `risk_score ∈ [0, 100]` per request, consumed by
Adaptive Authorization (§11).

### 10.2 Signals

| Signal | Direction |
|---|---|
| Unknown device | ↑ |
| Unusual IP / ASN | ↑ |
| Impossible travel | ↑↑ |
| VPN / Tor | ↑ |
| Off-hours access to critical | ↑ |
| Bulk export volume | ↑ |
| Recent failed auth | ↑ |
| Recent denials on sensitive | ↑ |
| Trusted device + on-prem | ↓ |
| Fresh MFA | ↓ |

### 10.3 Rules

- RE1. Risk scoring is transparent — every score is explainable.
- RE2. Risk never *grants* rights; it can only *restrict* them.

### 10.4 Future Implementation Notes

- Run in shadow mode for one full quarter before enforcing.

---

## 11. Adaptive Authorization / التفويض التكيّفي

**English title:** Adaptive Authorization
**Arabic title:** التفويض التكيّفي

### 11.1 Purpose

Convert risk into a graduated authorization outcome.

### 11.2 Outcome Ladder

```
 risk 0–20   → ALLOW
 risk 21–50  → ALLOW + Require MFA step-up
 risk 51–75  → ALLOW + Require Approval (workflow)
 risk 76–90  → Temporary Restriction (read-only)
 risk 91–100 → DENY + Security incident event
```

### 11.3 Rules

- AA1. Ladders are per-classification (critical stricter than normal).
- AA2. Every adaptive decision is recorded in the V6 Authorization Decision Log.

### 11.4 Future Implementation Notes

- Ladders are policy-driven (§5) and per-tenant tunable.

---

## 12. Device Trust Model / نموذج الثقة بالأجهزة

**English title:** Device Trust Model
**Arabic title:** نموذج الثقة بالأجهزة

### 12.1 Trust Levels

| Level | Definition |
|---|---|
| `trusted` | Enrolled + attested corporate device |
| `corporate` | Managed by MDM, not fully attested |
| `known` | Previously seen for this user |
| `unknown` | First-seen device |
| `shared` | Kiosk / multi-user terminal |
| `rooted` / `jailbroken` | Integrity compromised |

### 12.2 Rules

- DT1. `rooted`/`jailbroken` devices cannot access `critical` permissions.
- DT2. `shared` devices require short session TTL and no PHI export.
- DT3. Device trust is a Context dimension (§4), consumed by Risk (§10).

### 12.3 Future Implementation Notes

- Device fingerprints must never contain PII.

---

## 13. Geo Authorization / التفويض الجغرافي

**English title:** Geographic Authorization
**Arabic title:** التفويض الجغرافي

### 13.1 Purpose

Enforce data residency and cross-border restrictions.

### 13.2 Rules

| # | Rule |
|---|---|
| G1 | Tenant declares `allowed_countries` and `residency_region`. |
| G2 | PHI export outside residency requires Compliance Officer approval. |
| G3 | Branch-scoped roles operate only within the branch country by default. |
| G4 | Impossible-travel detection escalates Risk (§10). |
| G5 | Geo evaluation uses multiple signals (IP, device GPS if opted in). |

### 13.3 Future Implementation Notes

- Geo lookups are cached at session start; refreshed on IP change.

---

## 14. Delegation Engine / محرك التفويض المؤقت

**English title:** Delegation Engine
**Arabic title:** محرك التفويض المؤقت

### 14.1 Purpose

Allow a principal to temporarily grant a **subset** of their authority
to another principal — under time, scope, and audit constraints.

### 14.2 Delegation Record

| Field | Purpose |
|---|---|
| `from_user` | Delegator |
| `to_user` | Delegate |
| `scope` | Permission subset + optional resource selector |
| `valid_from` / `valid_to` | Bounded window |
| `reason` | Business justification |
| `revocable_by` | Delegator, manager, Compliance |
| `audit_id` | Governance record |

### 14.3 Rules

- DL1. A delegate cannot re-delegate.
- DL2. Delegation cannot exceed the delegator's own authority.
- DL3. Critical permissions require manager approval to delegate.
- DL4. Expiration is enforced by the PDP, not by UI.
- DL5. Revocation is immediate and cluster-wide.

### 14.4 Future Implementation Notes

- Delegations expose a Compliance report on active grants per tenant.

---

## 15. Just-In-Time Authorization / التفويض الآني

**English title:** Just-In-Time (JIT) Authorization
**Arabic title:** التفويض الآني

### 15.1 Purpose

Elevate a user to a higher permission set only for the minimum time
required to perform an approved task — reducing standing privilege.

### 15.2 Flow

```
 Request ─▶ Justification ─▶ Approver ─▶ Time-boxed grant ─▶ Auto-expire ─▶ Audit
```

### 15.3 Rules

| # | Rule |
|---|---|
| JIT1 | Elevation requires approval for `critical`, notification for `sensitive`. |
| JIT2 | Maximum window per elevation is policy-defined (default 60 min). |
| JIT3 | Elevations are visible on the user's session banner. |
| JIT4 | Expiration is automatic and irreversible without a new request. |

### 15.4 Future Implementation Notes

- Elevated sessions carry a distinct `session_class` for audit correlation.

---

## 16. PDP / PEP Enterprise Architecture / معمارية PDP و PEP

**English title:** PDP / PEP Enterprise Architecture
**Arabic title:** معمارية نقطة اتخاذ القرار ونقطة التنفيذ

### 16.1 Concepts

- **PEP — Policy Enforcement Point:** the surface that intercepts a request
  (UI guard, API middleware, RLS layer) and asks the PDP for a decision.
- **PDP — Policy Decision Point:** the pure evaluator that consumes
  `(subject, action, resource, context)` and returns
  `Decision { effect, obligations, reason, explain }`.
- **PIP — Policy Information Point:** attribute providers (registry,
  bundles, relationships, context, risk).
- **PAP — Policy Administration Point:** governance UI + registries (V6).

### 16.2 Flow

```
   ┌─────┐  request   ┌─────┐  query   ┌─────┐
   │ PEP │──────────▶ │ PDP │────────▶ │ PIP │
   └─────┘            └─────┘          └─────┘
      ▲                 │ decision + obligations
      └─────────────────┘
```

### 16.3 Rules

- PDP1. The PDP is stateless per request; caching is external.
- PDP2. Every decision is explainable (V6 Explainability).
- PDP3. PEPs never re-implement policy — they enforce PDP output.

### 16.4 Future Implementation Notes

- Colocate PDP with PEP for latency; keep the contract identical remotely.

---

## 17. Enterprise Authorization API / واجهة التفويض المؤسسية

**English title:** Enterprise Authorization API (future)
**Arabic title:** واجهة التفويض المؤسسية (مستقبلية)

### 17.1 Purpose

A stable, versioned interface between callers (frontend, backend,
mobile, agents) and the PDP. Documentation only — no implementation.

### 17.2 Conceptual Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /authz/check` | Single decision |
| `POST /authz/batch` | Vectorized decisions for list views |
| `POST /authz/explain` | Human-readable rationale |
| `POST /authz/simulate` | Playground / what-if |
| `GET  /authz/effective` | Effective permissions for principal |

### 17.3 Rules

- API1. Requests are authenticated and tenant-scoped.
- API2. Responses carry `decision_id` for correlation with audit.
- API3. Batch responses preserve request order and never partial-fail silently.

### 17.4 Future Implementation Notes

- Version the API alongside the BA-version of the compiled policy set.

---

## 18. Cross-Service Authorization / التفويض عبر الخدمات

**English title:** Cross-Service Authorization
**Arabic title:** التفويض عبر الخدمات

### 18.1 Surfaces

| Surface | PEP Location |
|---|---|
| Frontend (Web) | Route guards, `Can` components |
| Backend (Edge Functions) | Middleware wrapper around handler |
| Mobile | Native guards mirroring web contract |
| AI Agents | Tool-call authorization broker |
| External APIs | OAuth2 scopes mapped to permissions |
| Microservices | Signed decision tokens (short-lived) |

### 18.2 Rules

- CS1. All surfaces consult the same PDP contract.
- CS2. AI agents act under a **derived principal** with an explicit
  reduced scope; they may never assume the calling user's full authority.
- CS3. Signed decision tokens must carry `decision_id`, `expires_at`, and
  the resource identifier(s) they authorize.

### 18.3 Future Implementation Notes

- Publish a cross-surface conformance suite before enabling agent tools.

---

## 19. Identity Federation / اتحاد الهويات

**English title:** Identity Federation
**Arabic title:** اتحاد الهويات

### 19.1 Supported Concepts

| Protocol | Use case |
|---|---|
| OIDC | Enterprise SSO, Google Workspace |
| OAuth2 | External API access delegation |
| SAML | Legacy enterprise IdPs |
| SSO (broker) | Unified sign-in across tenants |
| External IdPs | Ministry-of-Health / insurer portals |

### 19.2 Rules

- IF1. Federation authenticates; it never authorizes. Authorization is
  always resolved by the Practice Pulse Plus PDP.
- IF2. External claims map into internal roles via a governed
  claim-mapping registry (audited, versioned).
- IF3. Just-in-time provisioning respects V4 licensing and V6 approvals.
- IF4. Federation tokens expire independently of app sessions.

### 19.3 Future Implementation Notes

- Claim-mapping changes are BA-versioned like policies (§8).

---

## 20. Change Report / تقرير التغييرات

### 20.1 Files Created

- `docs/auth/BUSINESS_AUTHORIZATION_V7_POLICY_CONTEXT_ENGINE.md`

### 20.2 Files Modified

- None.

### 20.3 Files Untouched

- All source code (`src/**`)
- All edge functions (`supabase/functions/**`)
- All migrations and SQL
- All RLS policies
- All `SECURITY DEFINER` functions
- Supabase configuration (`supabase/config.toml`)
- Generated types (`src/integrations/supabase/**`)
- Authentication flow and configuration
- Permission engine (`src/lib/authz/**`)
- React components, routes, hooks, services, tests
- CI workflows, `package.json`, environment files, enums, types
- Prior authorization documents (V3, V3.1, V4, V5, V6) — unchanged

### 20.4 Future Risks

1. **Graph latency** — ReBAC lookups must be cached; naive queries add
   per-request DB round-trips.
2. **Policy sprawl** — Without the Optimizer (§7) enforced in CI, the
   corpus will accumulate dead and shadowed policies.
3. **Risk model calibration** — Poorly tuned Risk (§10) can either
   over-restrict clinicians or under-detect attackers.
4. **Delegation abuse** — Long or recursive delegations undermine SoD;
   §14 rules must be enforced by the PDP, not by UI.
5. **Federation drift** — External IdP claim changes can silently
   escalate privileges without a governed mapping registry (§19).
6. **Geo signal reliability** — IP-based geo is imprecise; residency
   decisions should require confirming signals.
7. **JIT fatigue** — Excessive elevation prompts cause rubber-stamping.
   Approvals must remain rare and meaningful.
8. **Compiled artifact staleness** — Policy changes must invalidate all
   PDP caches cluster-wide (§9).

### 20.5 Future Roadmap

| Phase | Scope |
|---|---|
| Phase 1 | Relationship graph schema + read API (design only in V7). |
| Phase 2 | Resource descriptors + batch loaders. |
| Phase 3 | Context Collector middleware + Playground fixtures. |
| Phase 4 | EPL registry + Compiler + Optimizer (CI-only first). |
| Phase 5 | Policy Versioning with V6 governance integration. |
| Phase 6 | Risk Engine (shadow mode) + Adaptive ladders (advisory). |
| Phase 7 | Device Trust + Geo enforcement (opt-in per tenant). |
| Phase 8 | Delegation + JIT elevation surfaces. |
| Phase 9 | PDP/PEP formalization + Authorization API (internal). |
| Phase 10 | Cross-service tokens + Federation claim mapping registry. |

### 20.6 Implementation Phases (Governance)

Every phase above MUST:

1. Ship as a BA-versioned change (V6 Authorization Version Registry).
2. Carry a rollback plan.
3. Run in shadow mode before enforcement.
4. Publish parity reports against the pre-V7 baseline.
5. Receive Compliance Officer sign-off before production activation.

---

### Confirmation of Non-Modification / تأكيد عدم التعديل

This document is **documentation only**. No source code, database
schema, migrations, RLS policies, `SECURITY DEFINER` functions, edge
functions, Supabase configuration, authentication flow, authorization
engine, permission registry, bundle definitions, feature flags, license
logic, React components, routes, hooks, services, API endpoints, tests,
CI workflows, `package.json`, environment files, generated types, or
enums were created, modified, or deleted as part of this task.

**V7 is design-complete and does not change runtime behaviour until
future implementation phases are formally approved and executed.**

**End of document.**
