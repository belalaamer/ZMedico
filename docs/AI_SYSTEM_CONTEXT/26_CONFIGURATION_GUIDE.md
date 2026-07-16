# 26 — Configuration Guide

## Environment variables
| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL. Auto-managed. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key. Safe to expose. |
| `VITE_SUPABASE_PROJECT_ID` | Project ref. Auto-managed. |

Secrets for Edge Functions are managed via `secrets--add_secret`. Never hardcode.

## Feature flags
Runtime flags live in `src/lib/authz/featureFlags.ts` and DB-side rows (**Assumption**). The R1 authorization flag gates canonical telemetry & source selection.

## App-level settings
- `clinic_settings`, `clinic_profile`, `invoice_settings`, `notification_settings`, `appointment_settings`, `queue_settings` — configurable per tenant/clinic.
- `system_languages` — active languages for i18n.
