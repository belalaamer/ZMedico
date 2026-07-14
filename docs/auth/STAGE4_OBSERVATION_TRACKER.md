# Stage 4 — Observation Tracker

**Stage:** 4 of 4 (per `CANONICAL_ACTIVATION_PLAN.md`)
**Scope:** 30-day production observation window under the canonical
runtime. Legacy fallback remains available. Phase C is blocked until
this tracker shows 30 consecutive clean days.
**Constraint:** No fabricated data. Operators fill in the rows daily
from production telemetry.

---

## How to use this tracker

1. Every day during the observation window, on-call fills the row for
   that day in each table below.
2. A day is **CLEAN** only if all of the following hold:
   - Shadow probe drift = 0 across all slices.
   - Authorization latency p95 within KPI target.
   - Permission drift diff count = 0.
   - No incidents opened against the canonical runtime.
   - No rollback executed.
   - No unexpected grants observed.
   - Unexpected denials within 2σ of the 7-day baseline.
   - `fetchCanonicalPermissions` error rate < 0.1%.
3. If any check fails, follow `ROLLBACK_PLAYBOOK.md` and reset the
   counter per `LEGACY_RETIREMENT_CRITERIA.md`.

Legend: `OK` / `WARN` / `FAIL` / `—` (not yet recorded).

---

## Shadow probe health (drift rows)

| Day | Date | Patients | Medical | HR | Invoices | Settings | Overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |
| 11 | | | | | | | |
| 12 | | | | | | | |
| 13 | | | | | | | |
| 14 | | | | | | | |
| 15 | | | | | | | |
| 16 | | | | | | | |
| 17 | | | | | | | |
| 18 | | | | | | | |
| 19 | | | | | | | |
| 20 | | | | | | | |
| 21 | | | | | | | |
| 22 | | | | | | | |
| 23 | | | | | | | |
| 24 | | | | | | | |
| 25 | | | | | | | |
| 26 | | | | | | | |
| 27 | | | | | | | |
| 28 | | | | | | | |
| 29 | | | | | | | |
| 30 | | | | | | | |

## Authorization latency (ms)

| Day | Date | p50 | p95 | p99 | KPI target met? |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |
| 11 | | | | | |
| 12 | | | | | |
| 13 | | | | | |
| 14 | | | | | |
| 15 | | | | | |
| 16 | | | | | |
| 17 | | | | | |
| 18 | | | | | |
| 19 | | | | | |
| 20 | | | | | |
| 21 | | | | | |
| 22 | | | | | |
| 23 | | | | | |
| 24 | | | | | |
| 25 | | | | | |
| 26 | | | | | |
| 27 | | | | | |
| 28 | | | | | |
| 29 | | | | | |
| 30 | | | | | |

## Permission drift (canonical vs legacy)

| Day | Date | Diff count | Roles affected | Notes |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |
| 16 | | | | |
| 17 | | | | |
| 18 | | | | |
| 19 | | | | |
| 20 | | | | |
| 21 | | | | |
| 22 | | | | |
| 23 | | | | |
| 24 | | | | |
| 25 | | | | |
| 26 | | | | |
| 27 | | | | |
| 28 | | | | |
| 29 | | | | |
| 30 | | | | |

## Incidents

| Day | Date | Severity | Description | Ticket | Resolved? |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Rollback events

| Day | Date | Trigger | Lever used | Duration | Restored to canonical? |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Unexpected grants (canonical > legacy)

| Day | Date | Role | Permission | Root cause | Fix ref |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Unexpected denials (canonical < legacy)

| Day | Date | Role | Permission | Root cause | Fix ref |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Canonical fetch errors

| Day | Date | Error rate | Fallback rate | Top error signature |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |
| 16 | | | | |
| 17 | | | | |
| 18 | | | | |
| 19 | | | | |
| 20 | | | | |
| 21 | | | | |
| 22 | | | | |
| 23 | | | | |
| 24 | | | | |
| 25 | | | | |
| 26 | | | | |
| 27 | | | | |
| 28 | | | | |
| 29 | | | | |
| 30 | | | | |

## Daily clean-day roll-up

| Day | Date | Clean? | Consecutive clean streak | Notes |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |
| 16 | | | | |
| 17 | | | | |
| 18 | | | | |
| 19 | | | | |
| 20 | | | | |
| 21 | | | | |
| 22 | | | | |
| 23 | | | | |
| 24 | | | | |
| 25 | | | | |
| 26 | | | | |
| 27 | | | | |
| 28 | | | | |
| 29 | | | | |
| 30 | | | | |

---

## Exit criteria for Stage 4 (gate to Phase C)

- [ ] 30 consecutive clean days recorded above.
- [ ] Zero drift throughout the window.
- [ ] Zero rollback events.
- [ ] Zero authorization incidents.
- [ ] Engineering + operations owners sign off in
      `LEGACY_RETIREMENT_CRITERIA.md`.

Until all boxes are checked, **Phase C (legacy retirement) remains
blocked.** Legacy code paths must not be removed.
