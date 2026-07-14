# Long-Term Roadmap — Sprint 5

Horizons: Immediate (next sprint) | Near-term (2–4 sprints) | Long-term
(quarter+) | Research only (no charter).

## Immediate

- Execute Sprint 4 pagination audit (top 5 list pages).
- Execute SECURITY DEFINER sweep script + remediation on offenders.
- Wire Sentry dashboards + alert routing (opt-in already shipped).

## Near-term

- Adopt React Query for authz + list pages.
- Remove `(supabase as any)` casts (type regeneration + Zod parsing).
- SQL views for report aggregation (v_doctor_performance et al.).
- Business-logic unit tests: invoicePdf, queueAlerts, insuranceContracts.
- MFA enrollment UX + role-gated enforcement.
- Data contracts runtime validation (Zod at ingress).
- Retention automation (cron per RETENTION_SPECIFICATION).
- Correlation ID propagation across all edge functions.
- Google OAuth admin-invite rollout (product-signal gated).

## Long-term

- Permission Consolidation Phases B–D (retire DEFAULT_PERMISSIONS + read
  path from role_permissions).
- Shadow framework retirement (post 30-day zero-drift).
- Image pipeline (WebP/AVIF via vite-imagetools).
- Table virtualization on long lists.
- Materialized views for reports.
- Documentation consolidation execution.
- Multi-region tenant partitioning (only if scale demands).

## Research only (deferred indefinitely; no charter)

- Event Bus (Kafka / NATS / Redpanda).
- Outbox / Inbox pattern.
- CQRS.
- Event Sourcing.
- Saga orchestration.
- DDD Repository layer.
- GraphQL / BFF.
- AI Gateway.
- Service Mesh.
- Data Mesh.
- Microservices decomposition.

## Guardrails

Every item in Research only requires a documented business trigger, an
adversarial architecture review, and explicit stakeholder sign-off before
promotion to any higher horizon. Absence of such a trigger is by itself
sufficient reason to keep the item deferred.
