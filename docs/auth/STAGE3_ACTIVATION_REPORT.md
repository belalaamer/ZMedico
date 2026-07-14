# Stage 3 — Production Activation Report

**Stage:** 3 of 4 (per `CANONICAL_ACTIVATION_PLAN.md`)
**Scope:** Enable the canonical authorization runtime as the
production default. Preserve legacy fallback for Stage 4 observation.
**Constraint:** No removal of legacy code. No changes to schema, RLS,
SECURITY DEFINER, Edge Functions, business logic, or authorization APIs.

---

## Activation summary

| Field | Value |
| --- | --- |
| Activation date | 2026-07-14 |
| Environment | Production |
| Build var | `VITE_AUTHZ_CANONICAL=true` |
| Runtime source | `v_authz_effective_permissions` |
| Legacy code retained | `DEFAULT_PERMISSIONS`, `loadLegacy()`, `role_permissions` reader |
| Transparent fallback | ACTIVE — on any canonical fetch error, legacy path resolves the decision |
| Admin bypass | UNCHANGED — `isAdmin` short-circuits before either loader |
| Feature-flag rollback | AVAILABLE — flip `VITE_AUTHZ_CANONICAL=false` and redeploy, or `localStorage["authz_canonical"]="false"` per tab |

## Deployment procedure

1. Confirm Stage 2 exit criteria satisfied.
2. Announce activation window in the ops channel; freeze unrelated
   deploys.
3. Snapshot the production database (managed backup) and archive the
   current shadow probe output as the pre-cutover baseline.
4. Set `VITE_AUTHZ_CANONICAL=true` in the production build environment.
5. Deploy the frontend build with the flag on. No schema or Edge
   Function deploy is required.
6. Execute the cutover smoke checklist:
   - Admin bypass on `/settings`.
   - One gated route per non-admin role.
   - One export gate via `<CanExport>`.
   - One RLS-protected mutation (patient create).
7. Watch KPI dashboard for 60 minutes with on-call attached.
8. Hold on-call for 24 hours per `AUTHORIZATION_OPERATION_RUNBOOK.md`.

## Rollback confirmation

- **Primary lever:** unset `VITE_AUTHZ_CANONICAL` (or set `false`) and
  redeploy. Takes effect on next page load. Legacy path resumes with
  no session invalidation.
- **Per-tab lever:** `localStorage.setItem("authz_canonical","false")`
  for an urgent single-user reproduction.
- **No data rollback required:** canonical view is read-only from the
  runtime perspective. No migration to revert.
- **Rollback SLA:** < 5 minutes end-to-end.
- **Trigger:** any KPI red for > 5 minutes, any privilege drift, any
  spike in `fetchCanonicalPermissions` errors, or any user-reported
  escalation. See `ROLLBACK_PLAYBOOK.md`.

## Expected monitoring

Continuously, per `AUTHORIZATION_MONITORING_PLAN.md`:

- Shadow probe drift = 0 across patients / medical / hr / invoices / settings.
- `fetchCanonicalPermissions` error rate < 0.1%.
- Unexpected denies within 2σ of the 7-day baseline.
- Unexpected grants: none. Canonical set must not exceed legacy set.
- Permission cache fingerprint churn within 10× baseline.
- RLS denial rate stable per table.
- Edge Function `admin-*` 401/403 rate < 1%.

All alerts route to on-call; any privilege drift auto-triggers
`ROLLBACK_PLAYBOOK.md` evaluation.

## Success criteria

- [x] Canonical runtime resolves every non-admin authorization decision
      in production.
- [x] Legacy fallback intact and exercised via transparent fallback on
      any canonical read error.
- [x] Feature-flag rollback rehearsed and confirmed operational.
- [x] Admin bypass unchanged.
- [x] No schema / RLS / SECURITY DEFINER / Edge Function change made
      during activation.
- [ ] 30 consecutive clean production days (tracked in Stage 4).

## Stage 3 status

**COMPLETE — canonical runtime is the production default.**

Legacy retirement (Phase C) remains blocked until Stage 4 completes
successfully per `LEGACY_RETIREMENT_CRITERIA.md`.
