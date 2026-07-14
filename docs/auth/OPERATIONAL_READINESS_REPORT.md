# Phase O — Operational Readiness Report

**Scope:** Verification-only audit of the operational layer around the
authorization runtime. No authorization logic, permissions, bundles,
RLS, SECURITY DEFINER functions, Edge Functions, schemas, or business
rules were modified. Phase C (legacy retirement) remains intentionally
blocked.

**Evidence key**

- **REPO** — Repository evidence (files under version control).
- **CONF** — Configuration evidence (CI workflow, env flags).
- **RUN** — Runtime evidence (would require live probing).
- **PROD** — Production evidence (would require external telemetry).
- **NOT VERIFIED** — Cannot be confirmed from the repository alone.

---

## 1. Monitoring Status

| Signal | Producer | Status | Evidence |
| --- | --- | --- | --- |
| Shadow probe execution | `.github/workflows/shadow-qa.yml` (5-slice matrix) | Implemented in CI | REPO/CONF |
| Permission drift detection | `src/lib/authz/slices/*.slice.parity.test.ts`, per-slice `*ShadowProbe.ts` | Implemented (test-time + runtime probe) | REPO |
| Canonical fetch failures | `src/lib/authz/canonicalPermissions.ts` (fail-open to legacy in `usePermissions`) | Fallback exists; **error rate metric NOT produced** | REPO / NOT VERIFIED |
| Authorization latency (p50/p95/p99) | `src/lib/authz/telemetry.ts` `lookupLatency` (count/total/max/avg) | Partial — **only avg + max, no percentiles** | REPO |
| Unexpected grants | Slice parity tests + shadow probes | Test-time only | REPO |
| Unexpected denials | Slice parity tests + shadow probes; `authorizationFailures` counter | Counter is total denies, not "unexpected" | REPO |
| RLS authorization failures | Postgres logs (external analytics) | External; **no in-app collector** | NOT VERIFIED |
| Edge Function authorization failures | Edge function logs (external) | External; **no in-app collector** | NOT VERIFIED |
| Authorization incident counter | Manual (ops ticket tracker per `AUTHORIZATION_KPIS.md`) | Manual only | REPO |
| Rollback events | Manual (flag flip; playbook driven) | Manual only | REPO |

---

## 2. KPI Dashboard

**No in-app KPI dashboard exists in the repository.** KPI targets are
defined in `docs/auth/AUTHORIZATION_KPIS.md`; no code surface (page,
route, or component) renders them. Observation is currently manual via
`docs/auth/STAGE4_OBSERVATION_TRACKER.md`.

| KPI | Definition source | In-app surface | Evidence |
| --- | --- | --- | --- |
| Authorization Success Rate | KPIs doc | None | NOT VERIFIED |
| Permission Drift % | KPIs doc | None (shadow probes only) | NOT VERIFIED |
| Canonical Fetch Error Rate | KPIs doc | None | NOT VERIFIED |
| Shadow Probe Health | KPIs doc | CI job status | CONF |
| Authorization Latency | KPIs doc | `telemetry.getMetrics()` (in-memory) | REPO |
| Rollback Count | KPIs doc | None | NOT VERIFIED |
| Authorization Incidents | KPIs doc | None (manual register) | NOT VERIFIED |
| Unexpected Grants | KPIs doc | None (test-time only) | NOT VERIFIED |
| Unexpected Denials | KPIs doc | None (total denies only) | NOT VERIFIED |

---

## 3. Telemetry Coverage

In-app telemetry is implemented in `src/lib/authz/telemetry.ts`, gated
by the R1 feature flag (`src/lib/authz/featureFlags.ts`).

| Metric | Produced | Collected | Stored | Visualized | Threshold |
| --- | --- | --- | --- | --- | --- |
| Decision (allow/deny, source, latency) | `useAuthorization.ts:40` → `recordDecision` | In-memory ring (500) | Process memory only | None | None in-app |
| Cache refresh count | `useAuthzState.ts:48` → `recordCacheRefresh` | Counter | Process memory | None | None |
| Fingerprint change count | `useAuthzState.ts:50` → `recordFingerprintChange` | Counter | Process memory | None | None |
| Lookup latency avg / max | `recordDecision` | Counter | Process memory | None | KPI doc only |
| Percentiles p50 / p95 / p99 | **Not produced** | — | — | — | **MISSING** |
| Canonical fetch error rate | **Not produced** | — | — | — | **MISSING** |
| RLS denials | Postgres analytics | External | Supabase logs | Manual queries | **MISSING alert** |
| Edge fn 401/403 | Edge function logs | External | Supabase logs | Manual queries | **MISSING alert** |
| Sink for external export | `setTelemetrySink` API exists | Not wired | — | — | **MISSING wiring** |

**Missing telemetry (identified only, not invented):**

1. Percentile histogram for authorization latency.
2. Canonical fetch error counter around `canonicalPermissions.ts`.
3. External sink registration — `setTelemetrySink` is present but no
   caller registers it (verified via `rg`).
4. Persistent storage for decision counters (all metrics reset on
   reload).

---

## 4. Alert Coverage

| Alert | Required by | Configured in repo | Status |
| --- | --- | --- | --- |
| Permission Drift > 0 | Monitoring plan | Shadow QA CI failure | PARTIAL (CI-only, no paging) |
| Canonical Fetch Error Rate > 0.1% | Monitoring plan | None | **MISSING** |
| Authorization Incident | Monitoring plan | None (manual) | **MISSING** |
| Rollback Event | Monitoring plan | None (manual) | **MISSING** |
| Shadow Probe Failure | Monitoring plan | GitHub Actions default notify | PARTIAL |
| Unexpected Grant | Monitoring plan | None | **MISSING** |
| Unexpected Denial spike (>2σ) | Monitoring plan | None | **MISSING** |

No paging integration (PagerDuty / Opsgenie / Slack webhook) is
configured in the repository. Alerting today = human review of CI
status + manual dashboard checks.

---

## 5. Operational Audit — Runtime Components

### Active runtime

- `src/hooks/usePermissions.ts` — feature-flagged dual path.
- `src/lib/authz/canonicalFlag.ts` — `VITE_AUTHZ_CANONICAL` / LS.
- `src/lib/authz/canonicalPermissions.ts` — canonical loader.
- `src/lib/authz/AuthorizationService.ts` — decision service.
- `src/lib/authz/useAuthorization.ts` — decision hook (emits telemetry).
- `src/lib/authz/useAuthzState.ts` — cache/fingerprint state.
- `src/components/Can.tsx`, `CanExport.tsx`, `PermissionRoute.tsx` — gates.

### Dormant legacy (preserved for fallback — DO NOT REMOVE)

- `src/lib/rolePermissions.ts` (`DEFAULT_PERMISSIONS`).
- Legacy branch inside `usePermissions.loadLegacy()`.
- `role_permissions` table reads on legacy path.

### Monitoring

- `src/lib/authz/telemetry.ts` (in-memory).
- `src/lib/authz/*ShadowProbe.ts` (5 slices).
- `src/lib/observability/sentry.ts`, `correlationId.ts`.
- `.github/workflows/shadow-qa.yml` (matrix CI job).
- `tests/playwright/*.shadow.spec.ts` and `.validate.spec.ts`.

### Recovery

- Feature flag flip (`VITE_AUTHZ_CANONICAL=false` or LS override).
- `usePermissions` fail-open to legacy on canonical fetch error.

### Rollback

- `docs/auth/ROLLBACK_PLAYBOOK.md`.
- `docs/rc1/RC1_ROLLBACK_PLAN.md` (frontend Version History, edge fn
  revision history, DB snapshot restore).

### Operational flow diagram

```
   ┌─────────────┐     ┌────────────────────────────┐
   │  UI gates   │────▶│ useAuthorization / Can /   │
   │ (routes,    │     │ CanExport / PermissionRoute│
   │  components)│     └──────────────┬─────────────┘
   └─────────────┘                    │
                                      ▼
                           ┌──────────────────────┐
                           │ AuthorizationService │
                           └──────────┬───────────┘
                                      │
                     ┌────────────────┴────────────────┐
                     ▼                                 ▼
       ┌──────────────────────────┐        ┌─────────────────────────┐
       │ usePermissions           │        │ usePermissions (legacy) │
       │  canonical path          │        │  fallback path          │
       │ v_authz_effective_perms  │        │ role_permissions +      │
       └─────────────┬────────────┘        │ DEFAULT_PERMISSIONS     │
                     │                     └─────────────────────────┘
                     ▼
              ┌────────────┐     shadow probes (5 slices)
              │ telemetry  │◀────────────────────────────┐
              │ (in-memory)│                             │
              └─────┬──────┘                       CI: shadow-qa.yml
                    ▼                              (drift detection)
           [ NO EXTERNAL SINK ]
           [ NO ALERT ROUTER  ]
           [ NO IN-APP KPI UI ]
```

---

## 6. Recovery Validation

Verified against `docs/auth/ROLLBACK_PLAYBOOK.md` (REPO):

| Item | Present | Notes |
| --- | --- | --- |
| Rollback trigger criteria | ✅ | Drift > 0, denial spike, grant spike, fetch errors > 0.1%, RLS spike, escalation report |
| Rollback steps | ✅ | Env flip `VITE_AUTHZ_CANONICAL=false` + redeploy, or per-tab LS override |
| Expected recovery time | ✅ | "Next page load" (LS); frontend redeploy for env flip |
| Post-rollback verification | ✅ | Re-run shadow probes, smoke per role, 30-min KPI watch |
| Restart / recovery procedure | ✅ | Diagnose → data/code fix → staging validation → 30-day counter reset |

**Not executed.** No rollback drill was run as part of this phase.

---

## 7. Remaining Operational Risks

1. **No external telemetry sink.** In-app metrics live in process
   memory and are lost on reload → no cross-session KPI truth.
2. **No in-app KPI dashboard.** Ops relies entirely on manual
   observation via `STAGE4_OBSERVATION_TRACKER.md`.
3. **No automated alerting.** All alerts require human review of CI
   status or manual SQL queries against Supabase logs.
4. **Latency percentiles missing** — only avg / max recorded.
5. **Canonical fetch error rate not instrumented** at the loader
   boundary.
6. **RLS / Edge Fn authz failures** visible only via manual analytics
   queries; no threshold-based paging.
7. **Rollback drill not exercised in production** during activation
   (Stage 3 report notes staging rehearsal only).

## Open Technical Debt

- Wire `setTelemetrySink` to `sentry.ts` `captureMessage` or an
  edge-function ingest endpoint.
- Replace avg/max latency with a small bucket histogram to compute
  p50 / p95 / p99.
- Add a counter around `canonicalPermissions.ts` fetch success/failure.
- Build an admin-only KPI dashboard page reading `getMetrics()` plus
  summarised Supabase log queries.
- Add a scheduled workflow that fails on drift > 0 outside CI
  (currently only on push / PR / manual dispatch).
- Formalise paging (Slack/Opsgenie webhook) from GitHub Actions
  shadow-qa failure and from KPI thresholds.

---

## Operational Readiness Score

| Dimension | Weight | Score | Weighted |
| --- | ---: | ---: | ---: |
| Runtime authorization stability (Phase B validated) | 25 | 100 | 25.0 |
| Recovery / rollback readiness (playbook + flag) | 15 | 90 | 13.5 |
| Shadow probe coverage (5 slices, CI-wired) | 15 | 85 | 12.8 |
| Telemetry production (in-app, gated) | 10 | 55 | 5.5 |
| Telemetry collection / storage (external) | 10 | 15 | 1.5 |
| KPI dashboard (in-app surface) | 10 | 10 | 1.0 |
| Alerting / paging | 10 | 15 | 1.5 |
| Documentation completeness | 5 | 95 | 4.75 |
| **Total** | **100** | | **65.6 / 100** |

**Operational Readiness Score: 66 / 100 — CONDITIONALLY READY.**

The authorization runtime itself is production-safe and fully covered
by parity tests and shadow probes. The operational envelope around it
— external telemetry, live dashboard, automated alerting — is **not**
production-grade and remains the dominant residual risk while Phase C
is held blocked. This is consistent with the intent of Phase C being
blocked pending 30 clean production days per
`LEGACY_RETIREMENT_CRITERIA.md`.

No changes were made to authorization logic, permissions, bundles,
schemas, RLS, SECURITY DEFINER functions, or Edge Functions during
this phase.
