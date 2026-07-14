# RC2 — Security Revalidation

Baseline: Sprint 1 (Security Hardening), Sprint 2 (Observability),
Sprint 4 (CI Hardening), RC1 (Freeze). No security-relevant code
was modified in RC2.

| Control                                                     | Status |
|-------------------------------------------------------------|:------:|
| `verify_jwt = true` on admin-* edge functions               | INTACT |
| Admin re-check inside admin edge functions                  | INTACT |
| `send-reminder` rate limit + SSRF guard + batch cap         | INTACT |
| `detect-queue-alerts` uses dedicated `CRON_SECRET`          | INTACT |
| `SUPABASE_SERVICE_ROLE_KEY` absent from `src/*`             | INTACT |
| `ProtectedRoute` + `PermissionRoute` guards                 | INTACT |
| `AuthorizationService` canonical funnel                     | INTACT |
| RLS enabled on user-facing tables                           | INTACT |
| `SECURITY DEFINER` least-privilege grants (Sprint 1 T2)     | INTACT |
| Client-write ban on `user_roles`, `role_permissions`, `employee_id_counter` | INTACT |
| Auth bundles integrity (N2 report)                          | INTACT |
| Role escalation surface (`AuthorizationService` audit)      | No new vectors |
| Dependabot                                                  | ACTIVE |
| CodeQL                                                      | ACTIVE |

**Findings:** 0 Critical / 0 High / 0 new Medium / 0 new Low.

**Deferred (unchanged):** TD-02 (DEFINER sweep), TD-07 (CSP), TD-08
(MFA), L2, L3.
