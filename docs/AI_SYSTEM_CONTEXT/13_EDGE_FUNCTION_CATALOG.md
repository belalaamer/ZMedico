# 13 — Edge Function Catalog

All under `supabase/functions/`. Deno runtime, shared helpers in `_shared/`.

| Function | Purpose | Auth | Notes |
|---|---|---|---|
| `admin-create-user` | Create a new staff user (auth + profile + role). | Admin JWT | Uses service role internally. |
| `admin-delete-user` | Delete a staff user + related profile/role rows. | Admin JWT | Cascade-safe. |
| `admin-reset-password` | Trigger password reset for a user. | Admin JWT | |
| `admin-export` | Bulk data export (audit-friendly). | Admin JWT + `audit_export_presets` | Emits audit log. |
| `detect-queue-alerts` | Scheduled scan of queue state; writes `queue_alerts` + `queue_alert_runs`. | Service (cron) | Idempotent per run row. |
| `enqueue-winback` | Enqueue win-back reminders for lapsed patients. | Admin/cron | Writes `reminders`. |
| `send-reminder` | Dispatch a single reminder via email/SMS/WhatsApp. | JWT | Templates from `*_templates`. |
| `_shared/correlation.ts` | Correlation ID helpers. | – | – |
| `_shared/cors.ts` | Shared CORS headers. | – | – |
| `_shared/sentry.ts` | Sentry init helpers. | – | – |

**Rules**: never log secrets; always return CORS headers; never trust client-provided user IDs — resolve from JWT.
