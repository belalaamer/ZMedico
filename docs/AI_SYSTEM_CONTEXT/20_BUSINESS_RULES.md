# 20 — Business Rules & Invariants

| Rule | Where enforced |
|---|---|
| Roles live only in `user_roles`. | DB + `has_role()` |
| Every public table has RLS enabled. | Migrations + `scripts/authz/analyze_rls.py` |
| Permission checks go through `AuthorizationService`. | Frontend guardrails (`scripts/authz/guardrails_frontend.py`) |
| Admin bypass is intentional. | `AuthorizationService.can()` |
| Invoice numbers are monotonic per counter. | `invoice_counters` + RPC |
| Refunds require `payments.refund`. | UI gate + backend policy |
| Wallet transactions must balance to `patient_wallets`. | Trigger / RPC (**Assumption**: DB-enforced) |
| Treasury daily close is immutable once posted. | `treasury_daily_closes` schema |
| PHI tables restricted to authorized roles. | RLS |
| Exports gated by `*.export` permissions. | `<CanExport>` + `exportGuard` |
| No `role === "admin"` in components. | `guardrails_frontend.py` |
| No direct edits to `src/integrations/supabase/*`. | Auto-generated; code review |
| Feature flags cannot be toggled to bypass permission checks. | `AuthorizationService` telemetry |
