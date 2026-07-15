# Platform Readiness Score

**Mode:** Documentation only. Scores derived from **repository
evidence only**. No production metrics invented. Where a dimension
cannot be evidenced from the repo it is explicitly marked NOT
VERIFIED.

**Scale:** 0–100 per dimension. Score reflects readiness of the
authorization platform *as a reusable commercial product*, not the
health of a single deployment.

---

## Summary

| Dimension | Score | Confidence |
|---|---|---|
| Architecture | 92 | Repository Evidence |
| Scalability | 78 | Repository Evidence |
| Maintainability | 85 | Repository Evidence |
| Extensibility | 90 | Repository Evidence |
| Multi-tenant readiness | 70 | Repository Evidence (partial) |
| Vendor neutrality | 95 | Repository Evidence |
| Backward compatibility | 98 | Repository Evidence |
| Performance | NOT VERIFIED for production | Repository Evidence only |
| Security | 88 | Repository Evidence |
| Operational maturity | 72 | Repository + Config Evidence |
| **Aggregate (weighted)** | **~85** | Mixed |

---

## Dimension Detail

### Architecture — 92
Evidence:
- Ten-layer model documented in
  `docs/auth/PLATFORM_AUTHORIZATION_MODEL.md`.
- Canonical runtime (`src/lib/authz/AuthorizationService.ts`,
  `useAuthorization.ts`) with legacy fallback and shadow probes.
- 32-domain registry in `UNIVERSAL_AUTHORIZATION_TAXONOMY.md`.
- Clear separation of Feature / Module / Permission / Bundle.
Deductions:
- Scope Layer still enforced through mixed RLS + runtime paths;
  scope-in-key encoding blocked pending ADR.

### Scalability — 78
Evidence:
- Bundle expansion is O(bundles × grants) with reducer caching in
  `canonicalPermissions.ts`.
- Shadow-probe harness demonstrates stable expansion sets.
Deductions:
- No published load-test evidence in-repo (NOT VERIFIED for peak
  concurrency).
- Percentile latency tracking not yet wired
  (see `docs/auth/OPERATIONAL_READINESS_REPORT.md`).

### Maintainability — 85
Evidence:
- Additive-only migration protocol (`docs/wave*/`,
  `docs/auth/AUTHORIZATION_NAMING_GUIDELINES.md`).
- Governance docs cover proposal, deprecation, rollback.
- Guardrail scripts under `scripts/authz/`.
Deductions:
- Documentation volume is high; consolidation plan tracked in
  `docs/sprint5/DOCS_CONSOLIDATION_PLAN.md` but not executed.

### Extensibility — 90
Evidence:
- `AUTHORIZATION_EXTENSION_GUIDE.md` shows 10 specialty examples
  using only the existing grammar.
- `authz_bundle_implies` supports composition without engine change.
- Feature Layer decouples specialty surfaces from permissions.
Deductions:
- No admin UI yet for dynamic bundle management (V2 optional).

### Multi-tenant Readiness — 70
Evidence:
- Tenant/Branch layers described; branch scoping in place.
- Tenant customization strategy documented.
Deductions:
- Tenant-scoped `authz_role_bundles` rows are a future column (V3);
  today all bundle mappings are global.
- Cross-tenant Organization layer reserved but unused in runtime.

### Vendor Neutrality — 95
Evidence:
- Zero specialty nouns in `authz_permissions` (per
  `AUTHORIZATION_CATALOG_REVIEW.md`).
- Grammar and closed verb vocabulary enforce neutrality.
- Ten-specialty extension guide validates neutrality.
Deductions:
- Two legacy group names (`hr`, `medical_records`) retained for
  parity; deprecation candidates only.

### Backward Compatibility — 98
Evidence:
- Every governance doc reiterates additive-only.
- Shadow-probe harness gates every catalog change.
- Legacy fallback preserved; admin bypass preserved; feature flag
  preserved.
Deductions:
- Two behavioural extension paths (scope-in-key, ABAC) explicitly
  gated behind ADRs; not yet started.

### Performance — NOT VERIFIED for production
Evidence in-repo:
- Reducer + memoized `useAuthorization` hook.
- Sprint 2 phase reports document targeted optimizations.
Not verifiable from repo:
- Production p50/p95/p99 latency of decisions.
- Bundle-expansion cache hit rate under real load.
Recommendation: wire external telemetry sink before assigning a
production score.

### Security — 88
Evidence:
- SECURITY DEFINER standard (`docs/security/S1_*`).
- RLS enabled on relevant tables; guardrails scripts under
  `scripts/authz/`.
- No specialty-coupled keys; no privilege-escalation surface added.
- Rollback playbook (`ROLLBACK_PLAYBOOK.md`).
Deductions:
- MFA enrolment UX pending (`docs/sprint5/LONG_TERM_ROADMAP.md`).
- CodeQL workflow present but SAST coverage of authz DSL is
  minimal.

### Operational Maturity — 72
Evidence:
- Runbook, monitoring plan, KPI catalog, rollback playbook,
  activation stages 1–4 reports.
- Shadow-QA GitHub workflow.
Deductions:
- Automated alerting / paging not wired (per
  `OPERATIONAL_READINESS_REPORT.md`).
- External telemetry sink not wired.
- 30-day observation window not yet complete -> Phase C blocked.

---

## Aggregate

Unweighted mean across the nine verifiable dimensions
(excluding Performance): **~85**.

This positions the authorization system as a **reusable commercial
platform** with:
- Strong architecture, vendor neutrality, and backward compatibility.
- Clear extension paths for any healthcare vertical.
- Remaining work concentrated in operational tooling (telemetry,
  alerting) and optional platform versions V2–V7.

No score above should be interpreted as a production SLA. Production
readiness for legacy retirement is governed exclusively by
`LEGACY_RETIREMENT_CRITERIA.md` and the Phase C gate.
