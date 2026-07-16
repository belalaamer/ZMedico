# Authorization Architecture Hardening Review

**Mode:** Documentation only. No runtime, RLS, SECURITY DEFINER, Edge
Function, schema, bundle, permission, feature-flag, or behavioural
change. Every production decision remains byte-identical.

**Reviewer role:** Principal Security Architect.
**Baseline compared against:** Microsoft Dynamics 365, SAP S/4HANA,
Oracle Fusion Cloud, Salesforce, ServiceNow, Odoo Enterprise, Epic,
Cerner, and modern HIS RBAC/ABAC models.
**Repository evidence used:** `src/lib/authz/*`, `src/hooks/usePermissions.ts`,
`src/components/{Can,CanExport,PermissionRoute}.tsx`,
`docs/auth/*`, `docs/architecture/AUTHORIZATION_ARCHITECTURE.md`,
`docs/normalization/N*`, `docs/execution/BA0*`, `docs/rc1/*`,
`scripts/authz/*`, `supabase/functions/*`.

---

## 1. Executive Summary

The authorization platform is architecturally aligned with the top
tier of enterprise RBAC systems. The three-layer model (UI advisory →
route advisory → RLS authoritative), the canonical
`AuthorizationService`, the closed permission grammar, the composable
bundle graph (`authz_bundle_implies`), and the SECURITY DEFINER
minimum-privilege surface place it in the same architectural class as
Salesforce Permission Sets, ServiceNow ACL + Role hierarchy, and
Dynamics 365 Security Roles + Privileges.

Gaps versus enterprise leaders are almost entirely **capability
extensions** — delegated administration UIs, time-boxed grants,
break-glass workflows, ABAC predicates, cross-tenant reporting —
**not architectural defects**. Every such gap is marked
**Future Enhancement** or **Post-Phase-C only** so the current byte-
identical runtime is preserved.

No finding in this review recommends a change to runtime authorization
decisions, permissions, bundles, RLS, SECURITY DEFINER functions,
Edge Functions, schema, or feature flags.

---

## 2. Architecture Scorecard

Grading: **A** = matches or exceeds enterprise reference; **B** =
production-grade with minor gaps; **C** = adequate but constrained;
**D** = below enterprise bar; **F** = missing.

| # | Dimension | Grade | Classification |
|---|-----------|:-----:|----------------|
| 1 | Permission taxonomy | A- | Already Excellent |
| 2 | Bundle architecture | A | Already Excellent |
| 3 | Separation of duties (SoD) | B | Improvement Opportunity |
| 4 | Resource hierarchy | B+ | Improvement Opportunity |
| 5 | Action hierarchy | A- | Already Excellent |
| 6 | Future scalability | A- | Already Excellent |
| 7 | Specialty neutrality | A | Already Excellent |
| 8 | Multi-tenant readiness | A- | Already Excellent |
| 9 | Multi-branch readiness | A | Already Excellent |
| 10 | Franchise readiness | B | Future Enhancement |
| 11 | Enterprise governance | A- | Already Excellent |
| 12 | Delegated administration | C+ | Future Enhancement |
| 13 | Temporary / time-boxed permissions | D | Future Enhancement |
| 14 | Emergency (break-glass) access | D | Future Enhancement |
| 15 | Permission inheritance | A- | Already Excellent |
| 16 | Bundle inheritance | A | Already Excellent |
| 17 | Scope model (own/branch/org/global) | B+ | Improvement Opportunity |
| 18 | Ownership model | B | Improvement Opportunity |
| 19 | Cross-module consistency | A- | Already Excellent |
| 20 | Naming consistency | A- | Already Excellent |
| 21 | Versioning | A | Already Excellent |
| 22 | Auditability | B+ | Improvement Opportunity |
| 23 | Least privilege | A- | Already Excellent |
| 24 | Privilege-escalation resistance | A | Already Excellent |
| 25 | Maintainability | A- | Already Excellent |
| 26 | Documentation quality | A | Already Excellent |
| 27 | Platform portability | A- | Already Excellent |
| 28 | SaaS readiness | A- | Already Excellent |
| 29 | White-label readiness | B+ | Future Enhancement |
| 30 | Overall maturity | A- | Already Excellent |

**Aggregate architectural grade: A- (≈ 88 / 100).**

---

## 3. Strengths (Already Excellent)

1. **Closed permission grammar** `<domain>.<resource>.<action>[.<scope>]`
   with a bounded verb vocabulary (see
   `docs/auth/UNIVERSAL_AUTHORIZATION_TAXONOMY.md`). Comparable to
   Salesforce object-level permissions and Dynamics privilege naming.
2. **Composable bundles** via `authz_bundle_implies` with reducer-flat
   closure — architecturally equivalent to Salesforce Permission Set
   Groups and ServiceNow role inheritance, without the historical
   circular-reference pitfalls (guarded by
   `docs/normalization/N2_BUNDLE_INTEGRITY_REPORT.md`).
3. **Three-layer defense**: UI (`Can`, `CanExport`) advisory, route
   (`PermissionRoute`) advisory, RLS authoritative. Matches
   Epic/Cerner "display filter vs. security filter" separation.
4. **Minimum-privilege SECURITY DEFINER surface** — only two identity-
   write RPCs (`settings_assign_user_role`, `settings_save_role_permissions`).
   Better than most Odoo/ServiceNow deployments where DEFINER sprawl
   is common.
5. **Vendor-neutral catalog** — zero specialty nouns in keys; clinic
   type is a tenant configuration, not a permission axis. Rare even
   among top-tier HIS vendors.
6. **Canonical runtime with shadow parity** — the feature-flag +
   shadow-probe methodology mirrors LaunchDarkly-style guarded
   rollouts used at Salesforce and ServiceNow for permission engine
   swaps.
7. **Explicit governance corpus** — `docs/governance/*`,
   `docs/normalization/N1..N9`, `docs/rc1/*`, `docs/auth/*`.
   Documentation depth exceeds most commercial mid-market ERPs.
8. **Versioning discipline** — `BA01_AUTHORIZATION_VERSION_REGISTRY`
   plus integrity framework; on par with SAP transport-request
   discipline for authorization objects.

---

## 4. Weaknesses / Improvement Opportunities

All items below are architectural observations only. None alter
current authorization decisions.

### W-01 Separation of Duties encoded implicitly (Improvement Opportunity)
Enterprise ERPs (SAP GRC, Oracle Risk Management) ship a formal SoD
matrix (e.g. *cannot both approve and pay*). Current bundles rely on
role assignment discipline rather than an explicit conflicting-set
registry.
**Action (documentation candidate, non-behavioural):** publish an
SoD conflict matrix reflecting *existing* bundle assignments — no
enforcement change.

### W-02 Scope encoded via `default_scope` column, not in keys (Improvement Opportunity)
Salesforce and Dynamics express scope in the key/record-sharing rule.
Today, scope lives on the bundle grant. This is intentional and
documented (`PLATFORM_AUTHORIZATION_MODEL.md` §2.6). Encoding scope
into keys is a **Post-Phase-C only** ADR because it would be
behavioural.

### W-03 Ownership rules distributed across RLS (Improvement Opportunity)
`docs/SCOPE_OWNERSHIP_MODEL.md` describes ownership per resource but
there is no single machine-readable ownership registry. Enterprise
peers (ServiceNow ACL, Epic Chronicles security classes) centralize
this. **Documentation-only** consolidation is safe.

### W-04 Delegated administration is code-driven (Future Enhancement)
No UI today for a tenant admin to delegate a subset of admin rights
(e.g. HR admin only, Finance admin only). SAP, Salesforce, and
ServiceNow all expose delegated admin. **Post-Phase-C only.**

### W-05 No time-boxed / temporary grants (Future Enhancement)
Dynamics "Access Team Templates" and Oracle Fusion "temporary role
assignments" expire automatically. Current `user_roles` has no
`valid_from` / `valid_to`. **Post-Phase-C only** — requires schema.

### W-06 No break-glass / emergency access workflow (Future Enhancement)
Epic "Break-the-Glass" and Cerner "Emergency Access" grant time-boxed
elevated read with mandatory justification and audit banner. Today,
`isAdmin` bypass is the only elevation path. **Post-Phase-C only.**

### W-07 Audit log coverage is table-level, not decision-level (Improvement Opportunity)
`audit_logs` records data mutations, but there is no persistent
authorization-decision log (grant/deny + reason). ServiceNow's ACL
debug log and Salesforce Setup Audit Trail cover this. Telemetry
sink exists (`src/lib/authz/telemetry.ts`) — a **documentation-only**
retention policy could be described now; persistence is
**Post-Phase-C only.**

### W-08 Franchise / org-of-orgs reporting (Future Enhancement)
Layer 10 (Organization) exists in the model but is reserved. Multi-
brand franchisees cannot yet see consolidated dashboards across
tenants. **Post-Phase-C only** (ABAC / cross-tenant scope).

### W-09 White-label surface is partial (Future Enhancement)
Tenant-configurable labels documented in
`TENANT_CUSTOMIZATION_STRATEGY.md`, but there is no theming/brand
registry or per-tenant terminology dictionary at runtime. **Post-
Phase-C only** if it touches permission surfaces; UI-only theming is
independent.

### W-10 Resource hierarchy is flat for `hr.*` and `inventory.*` (Improvement Opportunity)
Noted in `AUTHORIZATION_TECHNICAL_DEBT.md` (D-05). Enterprise systems
group sub-resources (employees, payroll, leave, contracts) under a
resource parent. **Post-Phase-C only** — key renames are behavioural.

---

## 5. Technical Debt (architectural only)

| ID | Debt | Severity | Runtime Impact | Classification |
|----|------|----------|----------------|----------------|
| TD-A1 | Legacy grant map still present alongside canonical runtime | Low | None (parity 100 %) | Improvement Opportunity — resolved by Phase C |
| TD-A2 | Shadow probes ship in production bundle | Low | ~2–3 % JS | Improvement Opportunity |
| TD-A3 | Dual permission sources (`rolePermissions.ts` + `role_permissions` + bundles) | Medium | None | Post-Phase-C only |
| TD-A4 | No explicit SoD registry | Medium | None | Improvement Opportunity |
| TD-A5 | No time-boxed grant primitive | Medium | None | Future Enhancement |
| TD-A6 | No break-glass primitive | Medium | None | Future Enhancement |
| TD-A7 | Ownership rules not centrally registered | Low | None | Improvement Opportunity |
| TD-A8 | Authorization-decision log not persisted | Low | None | Future Enhancement |
| TD-A9 | Org (Layer 10) unused at runtime | Low | None | Future Enhancement |
| TD-A10 | `(supabase as any)` casts near authz-adjacent hooks | Low | None | Improvement Opportunity |

None of the above blocks Phase C. Phase C itself resolves TD-A1 and
enables TD-A3.

---

## 6. Future Roadmap (documentation-only sequencing)

All items are **Post-Phase-C only** unless flagged otherwise.

| Wave | Theme | Behavioural? | Depends on |
|-----:|-------|:------------:|-----------|
| F-1 | SoD conflict registry (documentation) | No | — |
| F-2 | Ownership registry consolidation (documentation) | No | — |
| F-3 | Shadow retirement | No (parity-safe) | Phase C |
| F-4 | Dual-source consolidation (drop `rolePermissions.ts`) | Yes | Phase C |
| F-5 | Time-boxed grants (`valid_from`/`valid_to`) | Yes | Phase C, ADR |
| F-6 | Break-glass workflow with mandatory justification | Yes | Phase C, ADR |
| F-7 | Delegated administration UI | Yes | F-4 |
| F-8 | Authorization-decision persistence + retention | Yes | Phase C |
| F-9 | ABAC predicates (patient-of-record, care-team) | Yes | ADR |
| F-10 | Org-layer activation + cross-tenant reporting | Yes | ADR |
| F-11 | White-label terminology dictionary (UI only) | No | — |
| F-12 | Resource-hierarchy renames (`hr.*`, `inventory.*`) | Yes | ADR + deprecation shims |

---

## 7. Readiness Scores

| Score | Value | Basis |
|-------|:-----:|-------|
| Enterprise Readiness | **88 / 100** | Matches Salesforce/ServiceNow architectural class; gaps are capability, not defect. |
| SaaS Readiness | **86 / 100** | Multi-tenant + multi-branch validated; franchise/org layer reserved. |
| White-label Readiness | **78 / 100** | Vendor-neutral catalog and tenant customization documented; per-tenant terminology dictionary not yet built. |
| **Overall Maturity** | **A- (≈ 87 / 100)** | Production-approved canonical runtime, governed lifecycle, documented platform model. |

---

## 8. Final Verdict

> **Enterprise Ready with Future Enhancements.**

The authorization architecture is production-approved and enterprise-
grade today. It is safe to operate at commercial scale across
multiple specialties, tenants, and branches with the current runtime
preserved byte-identically. All improvement items — SoD registry,
time-boxed grants, break-glass workflow, delegated admin, ABAC,
franchise/org-layer activation, resource-hierarchy renames — are
**Future Enhancements** and are explicitly **Post-Phase-C only** when
they would alter authorization behaviour.

Phase C remains intentionally blocked until the 30-day observation
window completes with zero drift, zero rollback, and zero
authorization incidents. No recommendation in this review advances,
bypasses, or short-circuits that gate.

*End of review.*