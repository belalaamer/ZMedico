# Technical Debt Register — Final (Sprint 5)

Format: ID | Item | Severity | Business Impact | Effort | Recommended Release

| ID | Item | Severity | Business Impact | Effort | Recommended Release |
|----|------|---------:|-----------------|-------:|---------------------|
| TD-01 | Server-side pagination on top list pages (patients, invoices, appointments, HR, inventory) | High | Prevents OOM/timeout at scale | M | Next sprint |
| TD-02 | SECURITY DEFINER audit sweep across 106 functions (search_path, caller checks) | High | Compliance + privilege containment | M | Next sprint |
| TD-03 | React Query adoption for authz + list pages | Medium | Cache reuse, fewer re-fetches | M | Near-term |
| TD-04 | Remove 127 `(supabase as any)` casts via type regeneration + Zod | Medium | Type safety, hidden bugs | M | Near-term |
| TD-05 | SQL views for report aggregation (v_doctor_performance et al.) | Medium | Reports latency at scale | M | Near-term |
| TD-06 | Business-logic unit tests (invoicePdf, queueAlerts, insuranceContracts) | Medium | Regression protection | M | Near-term |
| TD-07 | CSP + strict security headers | Medium | XSS mitigation depth | S | Hosting-header dependency |
| TD-08 | MFA enrollment UX + role-gated enforcement | Medium | Identity assurance | L (~1.5 sprint) | Near-term |
| TD-09 | Google OAuth admin-invite rollout | Low | Onboarding UX | S | On product signal |
| TD-10 | Permission consolidation Phases B–D (retire DEFAULT_PERMISSIONS + role_permissions read path) | Medium | Single source of truth | L | Long-term |
| TD-11 | Shadow probe retirement (post 30-day zero-drift telemetry) | Low | Bundle size, CI time | S | Long-term |
| TD-12 | Sentry dashboards, alert routing, SLO definitions | Medium | Ops response time | S | Near-term |
| TD-13 | Data contracts runtime validation (Zod at ingress) | Medium | Data quality | M | Near-term |
| TD-14 | Retention automation (cron for archival/deletion per RETENTION_SPECIFICATION) | Medium | Compliance | M | Near-term |
| TD-15 | Image pipeline (WebP/AVIF via vite-imagetools) | Low | LCP on mobile | S | Long-term |
| TD-16 | Table virtualization on long lists | Low | Perceived latency | M | Long-term |
| TD-17 | Materialized views for reports | Low | Report responsiveness | M | Long-term |
| TD-18 | Docs consolidation (archive wave3, execution, normalization series) | Low | Repo hygiene | S | Long-term |
| TD-19 | Dependency upgrade cadence via Dependabot triage | Low | Security drift | S | Ongoing |
| TD-20 | Consolidate correlation ID propagation across all edge functions | Low | Trace continuity | S | Near-term |

Severity legend: High = must-do before scale; Medium = do within 2 releases;
Low = opportunistic. Effort: S ≤ 2d, M ≤ 1w, L ≤ 2w.
