# RC1 — Security Report

**Baseline:** Sprint 1 (Security Hardening) + Sprint 2 (Observability)
+ Sprint 4 (CI Hardening). No security-relevant code was modified
during RC1.

## Verified controls

| Control                                                     | Status |
|-------------------------------------------------------------|:------:|
| JWT verification on admin-* edge functions                  | INTACT |
| Admin re-check inside admin edge functions                  | INTACT |
| `send-reminder` rate limit + SSRF guard + batch cap         | INTACT |
| `detect-queue-alerts` uses dedicated `CRON_SECRET`          | INTACT |
| `SUPABASE_SERVICE_ROLE_KEY` absent from `src/*`             | INTACT |
| `ProtectedRoute` + `PermissionRoute` guards                 | INTACT |
| `AuthorizationService` canonical decision funnel            | INTACT |
| RLS enabled on user-facing tables                           | INTACT |
| `user_roles`, `role_permissions`, `employee_id_counter` client-write ban | INTACT |
| SECURITY DEFINER least-privilege grants (Sprint 1 Task 2)   | INTACT |
| Dependabot (`.github/dependabot.yml`)                       | ACTIVE |
| CodeQL (`.github/workflows/codeql.yml`)                     | ACTIVE |

## Open findings

- **Critical:** 0
- **High:** 0
- **Medium (deferred, tracked):** TD-02 (DEFINER audit sweep),
  TD-07 (CSP headers, hosting dependency), TD-08 (MFA UX).
- **Low (deferred, tracked):** L3 (auth session in `localStorage`,
  Supabase default), L2 (no CSP `<meta>` in `index.html`).

## RC1 fixes applied

None. No verified vulnerability was discovered that would justify
a SECURITY DEFINER or RLS change under freeze rules.

## Recommendations (post-RC1, not this sprint)

1. Landing Sentry (or equivalent) within 30 days per M1.
2. Rotate cron secrets on a documented cadence.
3. Track Dependabot PRs weekly; escalate any advisory ≥ High.
