# 17 — Event Flow

The system does not use a message bus. "Events" are:
1. **Postgres triggers** on write to certain tables (audit, counters, wallet balance).
2. **Realtime channels** consumed by the UI (queue, notifications, appointments).
3. **Scheduled cron** invoking Edge Functions (`detect-queue-alerts`, `enqueue-winback`).
4. **User-initiated** side effects wired in mutation `onSuccess` handlers.

**Possible Future Direction**: dedicated `domain_events` table + outbox pattern for cross-context propagation.
