# Business Authorization V5 — Enterprise Implementation Architecture
# نموذج الصلاحيات المؤسسي — الإصدار الخامس

> **Status:** Documentation only. No code, schema, RLS, DEFINER, edge
> function, permission-engine, type, component, route, hook, service,
> migration, or test changes are performed by this document.
>
> **الحالة:** توثيق فقط.

V5 is the **implementation architecture** that follows V3, V3.1, and
V4. It does not redefine permissions, roles, or workflows. It explains
**how** the authorization engine will work internally once V4's design
is implemented in phases.

الإصدار الخامس هو **معمارية التنفيذ** التي تلي V3 و V3.1 و V4. لا
يعيد تعريف الصلاحيات أو الأدوار أو مسارات العمل، بل يشرح **كيف** سيعمل
محرك التفويض داخليًا عند تنفيذ تصميم V4 على مراحل.

---

## Table of Contents / الفهرس

1. Authorization Decision Engine / محرك قرار الصلاحيات
2. Effective Permission Resolution / حساب الصلاحيات الفعلية
3. Permission Cache Architecture / معمارية ذاكرة التخزين المؤقت
4. Permission Resolver / محلل الأولويات
5. Permission Simulator / محاكي الصلاحيات
6. Authorization Analyzer / محلل التفويض
7. Bundle Versioning / إصدارات الحزم
8. Emergency Access / الوصول الطارئ
9. Dynamic Policies / السياسات الديناميكية
10. Permission Risk Scoring / تقييم مخاطر الصلاحيات
11. Role Security Score / تقييم أمان الأدوار
12. Segregation of Duties Analyzer / محلل فصل المهام
13. Authorization Graph / الرسم البياني للتفويض
14. Authorization Dashboard / لوحة التفويض
15. Enterprise KPIs / مؤشرات الأداء المؤسسية
16. Enterprise Runtime Flow / تدفق التشغيل المؤسسي
17. Implementation Phases / مراحل التنفيذ
18. Change Report / تقرير التغييرات

---

## 1. Authorization Decision Engine / محرك قرار الصلاحيات

**English title:** Authorization Decision Engine.
**Arabic title:** محرك قرار الصلاحيات.

### Purpose / الغرض

Provide a single, deterministic pipeline that transforms an incoming
request into an `ALLOW` or `DENY` decision, with every stage
independently testable and observable.

توفير خط أنابيب واحد وحتمي يحوّل كل طلب إلى قرار سماح أو رفض.

### Architecture / المعمارية

```text
Request
  |
  v
[1]  Authentication            -- verify session / JWT / MFA claims
[2]  Tenant Validation         -- user.tenant_id == resource.tenant_id
[3]  Branch Validation         -- SameBranch or AnyBranch (global roles)
[4]  License Validation        -- plan unlocks the permission
[5]  Feature Flag Validation   -- system AND tenant AND branch = true
[6]  Role Resolution           -- active role bundles for the user
[7]  Permission Resolution     -- effective_permissions contains it
[8]  Dependency Validation     -- requires closure ok, no conflict
[9]  ABAC Evaluation           -- all conditions evaluate true
[10] Workflow Validation       -- state machine allows this action
[11] Approval Validation       -- approval ticket present when required
[12] RLS Validation            -- Postgres row-level policy accepts
  |
  v
Allow / Deny  -->  Audit event (V4 section 8)
```

### Rules / القواعد

- Every stage is **fail-closed**: any error or missing input = `DENY`.
- Stages 1-6 are cacheable (section 3). Stages 7-12 evaluate per request.
- A deny at any stage short-circuits; the denying stage and reason are
  recorded.
- The pipeline is **pure**; mutations happen only after `ALLOW`.
- Stage order is fixed; reordering is a versioned BA change.

### Examples / أمثلة

- Doctor viewing a record in another branch: stage 3 denies.
- Accountant approving own refund: stage 10 denies (Creator != Approver).
- Reception exporting patients: stage 7 denies.

### Future implementation notes / ملاحظات التنفيذ المستقبلي

- Implement each stage as an object exposing
  `evaluate(ctx) -> {decision, reason, telemetry}`.
- Telemetry per stage feeds section 15 KPIs.
- Never bypass a stage silently; use a flag with an auditable reason.

---

## 2. Effective Permission Resolution / حساب الصلاحيات الفعلية

### Purpose / الغرض

Compute the exact set of permissions available to a user at request
time by combining every source and applying precedence rules.

### Architecture / المعمارية

| # | Source | Scope | Lifetime |
|---|---|---|---|
| S1 | Direct Permissions | user | permanent until revoked |
| S2 | Role Bundles | user x role | while role assigned |
| S3 | Inherited Bundles | parent -> child role | derived |
| S4 | Temporary Grants | user x permission | time-boxed |
| S5 | Emergency Grants | user x permission | short-lived, dual control |
| S6 | Revoked Permissions | user x permission | overrides S1-S5 |
| S7 | Feature Flags | tenant / branch | AND-gate |
| S8 | License | tenant | AND-gate |
| S9 | ABAC Conditions | request context | AND-gate |

Combination:

```text
base       = S1 U S2 U S3 U S4 U S5
granted    = base \ S6
licensed   = { p in granted | license_allows(p, S8) }
flagged    = { p in licensed | flag_enabled(p, S7) }
effective  = { p in flagged  | abac_true(p, S9, ctx) }
```

### Precedence / الأولوية

```text
Explicit Deny (S6)
  > Emergency Grant (S5)
  > Temporary Grant (S4)
  > Direct Permission (S1)
  > Role Bundle (S2)
  > Inherited Bundle (S3)
  > Default Deny
```

Revoke always wins. Emergency grant may unlock a missing bundle entry
but never overrides a revoke.

### Rules / القواعد

- Computed per `(user, tenant, branch)`.
- Memoized in the Permission Cache (section 3).
- `implies` from V4 section 4 is materialized at compute time.
- Cross-tenant merges are forbidden.

### Examples / أمثلة

- Accountant's temporary `payments.export` grant expires; the next
  resolve drops it from `effective`.
- A revoke on `users.deactivate` removes it even if a bundle grants it.

### Future implementation notes

- Represent `effective` as a hashed `Set<string>` keyed as
  `sha256(user | tenant | branch | bundle_versions)`.
- Recompute atomically on any source change; never partially patch.

---

## 3. Permission Cache Architecture / معمارية ذاكرة التخزين المؤقت

### Purpose / الغرض

Keep authorization decisions fast (<5 ms p95) without sacrificing
correctness after grants, revokes, or flag changes.

### Architecture / المعمارية

| Cache | Key | Value | TTL | Invalidation |
|---|---|---|---|---|
| Permission | `(user, tenant, branch)` | effective set | 5 min | grant/revoke/role |
| Role | `user` | role list + metadata | 15 min | role assignment |
| Bundle | `bundle_id@version` | permission list | 24 h | bundle activation |
| License | `tenant` | plan + feature map | 1 h | plan change |
| Feature | `(scope, flag)` | boolean | 5 min | flag toggle |
| ABAC | `(condition_id, ctx_hash)` | boolean | 60 s | context-scoped |

### Rules / القواعد

- Fail-closed on miss; fall back to source of truth.
- Write-through invalidation on any grant/revoke/activation/toggle.
- Cluster sync via pub/sub; propagation target <= 500 ms p95.
- Warm-up top N tenants on process start.
- Keep ABAC TTL short; do not paper over time-based conditions.

### Examples / أمثلة

- Revoke of `payments.export` invalidates the user's Permission Cache
  across all nodes.
- License downgrade invalidates License Cache; Permission Cache goes
  stale lazily.

### Future implementation notes

- In-process LRU per node + shared invalidation bus.
- Emit hit ratio, evictions, propagation latency into section 15 KPIs.

---

## 4. Permission Resolver / محلل الأولويات

### Purpose / الغرض

Produce a single decision using a strict priority chain that is easy to
reason about and audit.

### Priority Order

```text
[1] Explicit Deny            -> DENY (terminal)
[2] Temporary Allow          -> ALLOW
[3] Emergency Override       -> ALLOW (audited as emergency)
[4] Bundle Allow             -> ALLOW
[5] Inherited Allow          -> ALLOW
[6] Default Deny             -> DENY
```

### Rules

- Deny beats Allow at any level; Explicit Deny beats every Allow above
  Default Deny.
- Emergency Override never bypasses SoD or Explicit Deny.
- Temporary Allow expires atomically.
- Default Deny is mandatory when no rule matches.

### Examples

- Bundle grants `medical_records.export` but a revoke is active -> DENY.
- Expired temporary `payments.refund_approve` falls through to bundle;
  if bundle lacks it -> DENY.
- Break-glass session grants `users.delete` for 30 min -> ALLOW,
  audit-tagged emergency.

### Future implementation notes

- Implement as `resolve(ctx) -> {decision, matched_rule, source_id}`.
- Unit tests: one per level plus crossings (Explicit Deny > Emergency).

---

## 5. Permission Simulator / محاكي الصلاحيات

### Purpose / الغرض

Let admins ask "what if" questions before changing bundles, roles, or
flags in production.

### Architecture / المعمارية

Inputs: baseline graph snapshot (section 13), proposed change set.
Outputs: effective-set diff, resource impact report, failing V4 rules,
newly-created SoD conflicts.

### Rules

- Read-only. Never mutates data.
- Long-lived simulations re-baseline before publishing.
- Each simulation persisted with an ID for change tickets.

### Examples

- "If Accountant loses `payments.view`, what will break?" -> lists
  affected pages, RPCs, workflows, and dependent permissions.
- "Activate `clinical.doctor@v7`" -> lists gained permissions and any
  new SoD conflicts (BLOCK on conflict).

### Future implementation notes

- Reuse section 4 resolver in dry-run mode.
- Expose via admin UI and CI (post diff in bundle PRs).

---

## 6. Authorization Analyzer / محلل التفويض

### Purpose / الغرض

Continuously scan the registry, bundles, and grants to surface hygiene
issues.

### Detections

| Finding | Definition |
|---|---|
| Unused permission | Not in any bundle/grant for N days. |
| Dead permission | Deprecated past removal window. |
| Duplicate | Same semantics under two ids. |
| Circular dependency | `requires` cycle. |
| Missing dependency | Bundle grants X without required Y. |
| Privilege escalation | Lower role can grant higher-role permission. |
| Role conflict | Same user holds SoD-conflicting roles. |
| Over-permissioned bundle | > 2 sigma above peer median. |
| Under-permissioned bundle | Missing critical baseline. |

### Rules

- Runs on schedule and every bundle PR.
- Severities `info` / `warn` / `block`; `block` fails CI.
- Findings expire on resolution or documented acknowledgement.

### Examples

- `patients.view.legacy` unused for 90 days -> warn + removal proposal.
- `finance.cashier` grants both refund_request and refund_approve ->
  block (V12 SoD).

### Future implementation notes

- Extend `scripts/authz/` with an analyzer entry point wired into
  `run_all.sh` after guardrails.
- Findings feed section 14.

---

## 7. Bundle Versioning / إصدارات الحزم

### Purpose / الغرض

Treat role bundles as versioned artefacts.

### Architecture

| Concept | Description |
|---|---|
| Bundle Version | Immutable `{bundle_id, version, permissions[], metadata}`. |
| History | Ordered list with author, timestamp, reason. |
| Rollback | Activate a prior version (new pointer, not a mutation). |
| Approval | N-of-M approvers per V4 section 11. |
| Diff | Structural + semantic diff. |
| Migration | Batch move users from vN to vN+1. |
| Activation | Atomic switch of `current_version` per tenant. |
| Deprecation | Version marked deprecated; new assignments blocked. |

### Rules

- No in-place edits; every change creates a new version.
- Per-tenant `current_version` enables safe pilots.
- Simulator (section 5) must run before activation.

### Examples

- `clinical.doctor@v6 -> v7` adds `medical_records.review`; two
  approvers; simulator: 12 users affected, no SoD.
- Rollback `finance.accountant@v9 -> v8` with documented reason.

### Future implementation notes

- Append-only storage. Bundle Cache keyed by `bundle_id@version`.

---

## 8. Emergency Access / الوصول الطارئ

### Purpose / الغرض

Provide a compliant break-glass mechanism for time-critical situations.

### Lifecycle

```text
Request -> Dual Approval -> MFA Step-Up -> Reason Captured
        -> Time-Boxed Session -> Actions Audited -> Auto Revoke
```

| Stage | Requirement |
|---|---|
| Request | Requestor, permission set, scope, justification. |
| Approval | Two distinct approvers; SoD respected. |
| MFA | Fresh MFA within N minutes. |
| Reason | Mandatory free text stored with audit. |
| Expiration | TTL <= 60 min; extension requires re-approval. |
| Auto revoke | Server-side timer; no client-side expiry. |
| Audit | Every action tagged `emergency=true`. |
| Dual control | Requestor != Approver != Second Approver. |

### Rules

- Cannot override Explicit Deny or SoD conflicts.
- Sessions visible on Dashboard (section 14) while active.
- Post-mortem within 24 h.

### Examples

- System Owner opens a 30-min session to restore a corrupt tenant
  backup; every action emergency-audited.

### Future implementation notes

- Modelled as an S5 grant with expiry and approval metadata.
- Critical alert on every session start.

---

## 9. Dynamic Policies / السياسات الديناميكية

### Purpose / الغرض

Encode runtime-data business rules as first-class policies.

### Examples

- Doctors may edit a medical record only within 48 h of creation.
- No user may export more than 1000 patient rows in a single request.
- Only Branch Manager may approve refunds outside business hours.
- Treasury edits allowed only during active working shift.

### Architecture

Policies live in the ABAC Condition Library (V4 section 3) with typed
inputs:

```yaml
- id: RecentAuthorship
  params: { window: PT48H }
  evaluate: |
    now() - resource.created_at <= params.window
    AND resource.created_by = user.id

- id: ExportLimit
  params: { max_rows: 1000 }
  evaluate: |
    request.row_count <= params.max_rows

- id: AfterHoursApprover
  evaluate: |
    (in_business_hours() OR user.role = 'branch_manager')
```

### Rules

- Pure, side-effect free.
- Parameters stored with the binding, not hard-coded.
- Time comparisons use tenant timezone.

### Future implementation notes

- Small DSL evaluator; never eval user-authored strings.
- Unit tests for boundary conditions and timezone edges.

---

## 10. Permission Risk Scoring / تقييم مخاطر الصلاحيات

### Purpose / الغرض

Attach a numeric risk score to every permission to drive alerting,
approvals, and dashboards.

### Scoring

| Verb / Class | Base | Notes |
|---|---|---|
| view | 1 | +2 for PHI/PII |
| edit | 3 | +1 if applies to approved records |
| delete | 5 | admin/system only |
| approve | 6 | terminal state transition |
| export | 6 | exfiltration risk |
| governance | 8 | break-glass, policy edits |
| system | 10 | root-level |

Modifiers: `+2` critical, `+1` mfa_required, `+1` approval_required,
`+1` PHI/PII/financial.

### Rules

- Score drives default audit/MFA/approval matrix (V4 section 5).
- Score >= 8 requires dashboard visibility and monthly review.

### Future implementation notes

- Store base in registry; compute modifiers from metadata.
- Feed sections 14 and 15.

---

## 11. Role Security Score / تقييم أمان الأدوار

### Purpose / الغرض

Aggregate permission risk into a per-role score.

### Calculation

```text
role_score = SUM permission_risk(p) for p in bundle
           x breadth_factor(role)
           x elevation_factor(role)
```

### Reference bands (illustrative)

| Role | Band |
|---|---|
| Reception / الاستقبال | Low |
| Doctor / الطبيب | Medium |
| Accountant / المحاسب | Medium |
| Medical Director / المدير الطبي | Medium-High |
| Branch Manager / مدير الفرع | High |
| Administrative Manager / المدير الإداري | High |
| Super Admin / المدير العام | Very High |
| System Owner / مالك النظام | Extreme (governance only) |

### Rules

- Very High / Extreme roles need named human owners.
- Bundle changes must not push a role above its current band without
  an approved exception.

### Future implementation notes

- Recompute on bundle activation; trend on section 14.

---

## 12. Segregation of Duties Analyzer / محلل فصل المهام

### Purpose / الغرض

Detect and prevent conflicting role or permission combinations.

### Detection matrix (examples)

| Conflict | Rule |
|---|---|
| Cashier + Accountant | Recording vs reconciliation. |
| Requester + Approver | Same actor on both sides. |
| Doctor + Medical Director | Creation vs approval. |
| System Owner + Compliance Officer | Action vs audit. |

### Rules

- Runs on role changes and bundle activation.
- `block` on V4 rule violation; `warn` otherwise.
- Resolutions: split responsibilities, add a second approver, or file a
  documented exception with expiry.

### Examples

- Assigning Cashier to a user already Accountant -> BLOCK with
  remediation options.

### Future implementation notes

- Model conflicts as `(role_a, role_b, reason)` and
  `(perm_a, perm_b, reason)`; extendable by governance.

---

## 13. Authorization Graph / الرسم البياني للتفويض

### Purpose / الغرض

Represent authorization as a graph for analysis and visualization.

### Model

```text
Role --has--> Bundle --contains--> Permission
                                 +--requires---> Permission
                                 +--implies----> Permission
                                 +--gated_by---> Condition --scoped_to--> Resource
```

Nodes: Role, Bundle, Permission, Condition, Resource.
Edges: has, contains, requires, implies, conflicts_with, gated_by,
scoped_to.

### Rules

- Acyclic across `requires` and `implies`.
- Traversals used by Simulator, Analyzer, Resolver.
- Snapshotted per bundle activation for reproducibility.

### Examples

- "Which roles can reach `payments.refund_approve`?" -> Branch Manager.
- "Remove `payments.view`" -> lists downstream nodes.

### Future implementation notes

- In-memory graph library; persistence is the registry.

---

## 14. Authorization Dashboard / لوحة التفويض

### Purpose / الغرض

Single pane of glass over the authorization system.

### Panels

- Permission statistics (counts, usage, unused).
- Denied requests (top denies, by user, by stage).
- Approval queues (age, SLA, backlog).
- Emergency sessions (active, recent, by requestor).
- Feature flags (per tenant/branch).
- License usage (by plan/tenant).
- Compliance score (aggregate, trend).
- Security score (per role/tenant).
- Bundle versions (current, pending, rollbacks).
- Policy violations (SoD, V4 rules).

### Rules

- Read-only; every action link routes into an audited flow.
- Powered by the same telemetry as section 15 KPIs.

### Future implementation notes

- Materialize aggregates hourly.

---

## 15. Enterprise KPIs / مؤشرات الأداء المؤسسية

### Purpose / الغرض

Measure the health and effectiveness of the authorization system.

### KPIs

| KPI | Target |
|---|---|
| Authorization latency (p95) | <= 5 ms in-process; <= 50 ms end-to-end |
| Permission cache hit ratio | >= 95% |
| Denied request ratio | Baseline +/- 20% |
| Critical action count | Trend; alert on step change |
| Approval SLA | 90% within target |
| Average review time | Tracked per module |
| MFA adoption | 100% for critical roles |
| Permission utilization | >= 70% |
| Unused permission ratio | <= 10% |
| Compliance score | >= 90 |
| Security score | >= 85 |

### Rules

- Computed from audit + telemetry, never sampled.
- Alerts have owners and runbooks.

### Future implementation notes

- Wire into existing observability; no parallel metrics pipeline.

---

## 16. Enterprise Runtime Flow / تدفق التشغيل المؤسسي

### Purpose / الغرض

End-to-end sequence for a single request.

### Sequence

```text
User
  | action
  v
Frontend  -- UI guard (Can / PermissionRoute)
  | request
  v
Authorization Engine  (section 1 pipeline)
  +--> Feature Flags       (V4 section 6)
  +--> License Validator   (V4 section 7)
  +--> Permission Resolver (section 4)
  +--> ABAC Engine         (V4 section 3, section 9)
  +--> Workflow Engine     (state machine)
  v
RLS  -- row-level policy enforced at Postgres
  v
Database  -- data read/write
  v
Response  -- audit event emitted (V4 section 8)
  v
User
```

### Rules

- UI guards are UX only; the server is the source of truth.
- Every layer denies independently.

### Examples

- Doctor edits a draft record: UI shows Edit; engine allows; ABAC
  `DraftOnly` passes; workflow allows; RLS accepts; audit written.

### Future implementation notes

- Distributed trace UI -> engine -> DB per request.

---

## 17. Implementation Phases / مراحل التنفيذ

### Phase 1 -- Registry Metadata
- **Objectives:** extend registry with V4 metadata; backfill defaults;
  add CI validators V01-V04, V11, V12.
- **Risks:** default drift.
- **Rollback:** revert schema + CI; registry is additive.
- **Dependencies:** none.

### Phase 2 -- Bundle Versioning
- **Objectives:** append-only versions, activation pointer, approvals.
- **Risks:** activation mistakes.
- **Rollback:** re-activate previous version.
- **Dependencies:** Phase 1.

### Phase 3 -- Permission Resolver
- **Objectives:** implement section 4 resolver + cache.
- **Risks:** cache staleness; latency regressions.
- **Rollback:** feature-flag resolver off.
- **Dependencies:** Phase 1, 2.

### Phase 4 -- ABAC
- **Objectives:** Condition Library wired into resolver.
- **Risks:** false denies.
- **Rollback:** disable per-condition via flag.
- **Dependencies:** Phase 3.

### Phase 5 -- Feature Flags
- **Objectives:** system/tenant/branch flags with inheritance + UI.
- **Risks:** cascading disables.
- **Rollback:** default-on posture during rollout.
- **Dependencies:** Phase 3.

### Phase 6 -- Licensing
- **Objectives:** plans bind flags -> permissions.
- **Risks:** abrupt downgrade removals.
- **Rollback:** grace period + read-only degradation.
- **Dependencies:** Phase 5.

### Phase 7 -- Break Glass
- **Objectives:** dual-controlled, time-boxed emergency access.
- **Risks:** misuse.
- **Rollback:** disable entrypoint.
- **Dependencies:** Phase 3, audit hardening.

### Phase 8 -- Dashboard
- **Objectives:** ship section 14 panels.
- **Risks:** stale aggregates.
- **Rollback:** hide dashboard, keep telemetry.
- **Dependencies:** Phase 3-7.

### Phase 9 -- KPIs
- **Objectives:** section 15 KPIs + alerting + runbooks.
- **Risks:** alert fatigue.
- **Rollback:** disable noisy alerts pending tuning.
- **Dependencies:** Phase 8.

---

## 18. Change Report / تقرير التغييرات

### Files created
- `docs/auth/BUSINESS_AUTHORIZATION_V5_IMPLEMENTATION_ARCHITECTURE.md`

### Files modified
- None.

### Files untouched
- All source code (`src/**`), edge functions (`supabase/functions/**`),
  migrations, RLS policies, SECURITY DEFINER functions, generated
  types (`src/integrations/supabase/**`), authentication configuration,
  permission engine (`src/lib/authz/**`), React components, routes,
  hooks, services, tests, and every prior authorization document
  (V2 matrix, V3, V3.1, V4).

### Risks
1. Cache correctness without cluster-wide invalidation.
2. Silent reordering of resolver priority levels.
3. Break-glass without true dual control.
4. Simulator diverging from the runtime resolver.
5. Missing per-stage telemetry hiding regressions.
6. License downgrades removing permissions without grace period.

### Future roadmap
- Externalize the registry through a governance API for regulator
  review (post Phase 9).
- Hash-chain audit events for tamper evidence.
- Federated authorization across tenants sharing governance.
- Policy authoring UI for non-engineers with staged approvals.

---

**End of document.** V5 is design-complete and ready for phased
implementation per section 17. No runtime behaviour changes result from
this file.
