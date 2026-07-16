# 21 — Security Model

## Layers of defense
1. **Auth** — Supabase GoTrue (email+password, Google OAuth). No anonymous signups.
2. **Session** — HttpOnly cookies via Supabase JS + localStorage token; refresh + rotate.
3. **RLS** — mandatory on every public table.
4. **RBAC** — canonical bundle-based, admin bypass, feature-flagged runtime, shadow probes.
5. **SECURITY DEFINER** — whitelisted RPCs; audited (`scripts/authz/compliance_definer.py`).
6. **Edge Functions** — CORS-scoped, JWT-verified, secrets never logged.
7. **Auditing** — `audit_logs`, `user_activity_logs`, authz shadow tables.
8. **Static analysis** — CodeQL + guardrail scripts in CI (`.github/workflows/`).
9. **Observability** — Sentry + correlation IDs.

## Threat model highlights
- Privilege escalation via role tampering — mitigated by `user_roles` + `has_role()`.
- Data exfiltration via unbounded queries — mitigated by pagination + RLS.
- Secrets leakage — service role never exposed to client; Lovable Cloud abstracts it.
- CSRF — token-based auth; no cookies used for API calls.
- XSS — React auto-escaping + strict content model; no `dangerouslySetInnerHTML` in shared code.

## Security memory
Managed via `security--update_memory`. See `docs/security/`.
