# Final Permission Consolidation Roadmap — Sprint 5

Confirms the multi-phase path first drafted in
docs/sprint4/PERMISSION_CONSOLIDATION_PLAN.md remains sound. No changes to
runtime, RLS, or SECURITY DEFINER functions in Sprint 5.

## Confirmed target

Single source of truth: `authz_bundles` + `has_permission()`. The
`role_permissions` table and `DEFAULT_PERMISSIONS` constant become derived
views generated from bundle model.

## Confirmed phases

| Phase | Scope | Gate | Reversible |
|-------|-------|------|-----------|
| A — Convergence proof | 14d zero-drift across 5 slices; CI blocks drift | Telemetry stable | Yes |
| B — Read-side cutover | Replace DEFAULT_PERMISSIONS reads with bundle lookup via AuthorizationService | Phase A green | Yes |
| C — Write-side cutover | Bundle-first editor UI; role_permissions becomes read-through cache | Phase B green + 1 release | Yes |
| D — Store retirement | Convert role_permissions to matview or drop; delete DEFAULT_PERMISSIONS | No reader remaining | Destructive; explicit approval required |

## Sprint 5 findings

- Shadow probe factory (Sprint 2) leaves the convergence pipeline healthy
  and cheap to maintain.
- No structural blocker discovered.
- Telemetry sink (src/lib/authz/telemetry.ts) is production-ready.
- Recommend commencing Phase A observation window immediately after
  Sprint 5 sign-off; Phase B requires a standalone charter.

## Non-actions in Sprint 5

- No permission store touched.
- No RPC modified.
- No wrapper switched.
- No CI job added.
