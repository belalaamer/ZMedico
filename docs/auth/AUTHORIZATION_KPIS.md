# Authorization KPIs

Steady-state targets used to gate promotion between stages of `CANONICAL_ACTIVATION_PLAN.md` and to evaluate readiness under `LEGACY_RETIREMENT_CRITERIA.md`.

| KPI | Definition | Target |
| --- | --- | ---: |
| Authorization Success Rate | (allow + intended deny) / total decisions | ≥ 99.99% |
| Permission Drift % | share of (role, permission) pairs where canonical ≠ legacy | 0% |
| Unexpected Denials | denials on routes/actions the role should have | 0 per day |
| Unexpected Grants | grants on routes/actions the role should not have | 0 per day |
| Shadow Probe Health | probe success rate across all slices | 100% |
| Average Authorization Latency | p50 client-side decision time | ≤ 2 ms |
| Authorization Latency p95 | p95 client-side decision time | ≤ 10 ms |
| Rollback Count | production flag flips to `false` in a 30-day window | 0 |
| Critical Authorization Incidents | P1/P2 tickets tagged `authz` per 30 days | 0 |
| Canonical Fetch Error Rate | `fetchCanonicalPermissions` non-2xx rate | ≤ 0.1% |
| Fingerprint Churn | authz-state fingerprint changes per user per hour | ≤ 1 baseline |

## Measurement sources

- Client telemetry: `src/lib/authz/telemetry.ts` metrics.
- Shadow probes: nightly Playwright job (`.github/workflows/shadow-qa.yml`).
- Parity diff: weekly canonical-vs-legacy report per role.
- Incident register: ops ticket tracker.
- Edge / RLS: existing platform observability.

## Reporting

- Daily: dashboard snapshot in ops channel.
- Weekly: written summary appended to the ops log.
- Monthly: archived KPI export retained for 12 months.
