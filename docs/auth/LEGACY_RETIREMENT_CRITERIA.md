# Legacy Authorization — Retirement Criteria

Legacy authorization (`DEFAULT_PERMISSIONS`, `role_permissions`, `loadLegacy()`, transparent fallback) may only be removed when **every** criterion below is true and independently verified. A single failed criterion blocks Phase C.

## Mandatory criteria

- [ ] Canonical runtime enabled by default in production (`VITE_AUTHZ_CANONICAL=true`) for ≥ 30 consecutive days.
- [ ] **Zero drift** between canonical and legacy effective permissions for 30 consecutive days (shadow probes + weekly diff report).
- [ ] **Zero rollback events** during the 30-day window (no production flag flips to `false`, no reverts).
- [ ] **Zero authorization incidents** (privilege escalation, privilege loss, wrongful denial, wrongful grant) in the window.
- [ ] Shadow probes healthy: 100% success across all slices (`patients`, `medical`, `hr`, `invoices`, `settings`) for the full window.
- [ ] All Playwright authorization tests green on every release build in the window (`rbac.spec.ts`, `rbac.deep.spec.ts`, all `*.shadow.spec.ts`, all `*.shadow.validate.spec.ts`).
- [ ] No emergency hotfixes to authorization code, RLS, SECURITY DEFINER functions, or Edge Function authorization in the window.
- [ ] KPI dashboard within targets for the full window (see `AUTHORIZATION_KPIS.md`).
- [ ] Rollback drill executed successfully within the window.
- [ ] Written sign-off from engineering owner and operations owner.

## Verification evidence required

- 30-day KPI export.
- Shadow probe archive (daily rows).
- Release-suite green history.
- Incident register showing zero authorization incidents.
- Rollback drill report.
- Sign-off memo referencing this document.

If any criterion fails, restart the 30-day counter after the root cause is remediated.
