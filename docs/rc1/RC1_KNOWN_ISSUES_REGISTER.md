# RC1 — Known Issues Register

Consolidated from `docs/sprint5/TECHNICAL_DEBT_REGISTER.md` and
`docs/final/FINAL_RELEASE_SIGNOFF.md`. No RC1-specific issues were
introduced.

## HIGH

| ID    | Item                                                                | Impact | Owner Timeline |
|-------|---------------------------------------------------------------------|--------|----------------|
| TD-01 | Expand server-side pagination to Appointments, HR, Inventory pages  | Prevents OOM/timeout at scale | Next sprint |
| TD-02 | SECURITY DEFINER audit sweep across 106 functions (search_path, caller checks) | Compliance + privilege containment | Next sprint |

## MEDIUM

| ID    | Item |
|-------|------|
| TD-03 | React Query adoption for authz + list pages |
| TD-04 | Remove 127 `(supabase as any)` casts (regen types + Zod) |
| TD-05 | SQL views for report aggregation (`v_doctor_performance`, …) |
| TD-06 | Unit tests for `invoicePdf`, `queueAlerts`, `insuranceContracts` |
| TD-07 | CSP + strict security headers (hosting-header dependency) |
| TD-08 | MFA enrollment UX + role-gated enforcement |
| TD-10 | Permission consolidation Phases B–D (retire `DEFAULT_PERMISSIONS` + `role_permissions` read path) |
| TD-12 | Sentry dashboards, alert routing, SLO definitions |
| TD-13 | Data-contract runtime validation (Zod at ingress) |
| TD-14 | Retention automation (cron per `RETENTION_SPECIFICATION`) |
| M1    | Error monitoring provider selection (Sentry/PostHog) |

## LOW

Tracked in `docs/sprint5/TECHNICAL_DEBT_REGISTER.md` (TD-09, TD-11,
TD-15 through TD-20) and `docs/final/FINAL_RELEASE_SIGNOFF.md`
(L1–L7). All Safe-to-Defer; none block RC1.
