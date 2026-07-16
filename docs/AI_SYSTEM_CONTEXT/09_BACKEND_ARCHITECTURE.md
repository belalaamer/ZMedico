# 09 — Backend Architecture

## Supabase composition
- **Postgres 15** with RLS, SECURITY DEFINER RPCs, views (`v_authz_effective_permissions`, reporting views).
- **GoTrue Auth** with email + Google OAuth (see `AuthContext`).
- **Storage** buckets for patient documents / receipts (**Assumption** based on `patient_documents` schema).
- **Edge Functions** in Deno.

## Edge Functions
Cataloged in `13_EDGE_FUNCTION_CATALOG.md`:
- `admin-create-user`
- `admin-delete-user`
- `admin-reset-password`
- `admin-export`
- `detect-queue-alerts`
- `enqueue-winback`
- `send-reminder`
- `_shared/` (correlation, cors, sentry helpers)

## Cross-cutting
- **Correlation IDs** — `src/lib/observability/correlationId.ts` + `_shared/correlation.ts`.
- **Sentry** — `src/lib/observability/sentry.ts` + `_shared/sentry.ts`.
- **CORS** — `_shared/cors.ts`.

## Authorization for server logic
- Definer RPCs whitelisted in `scripts/authz/rpc_manifest.yaml`.
- Edge functions verify JWT unless explicitly public. Never expose `SUPABASE_SERVICE_ROLE_KEY` (not available on Lovable Cloud).
