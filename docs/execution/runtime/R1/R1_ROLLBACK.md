# R1 Rollback — Runtime Consumer Foundation

R1 is entirely feature-flagged. Rollback is instant and requires no
migration.

## Instant rollback (production)
Set `VITE_AUTHZ_R1=false` in the deploy environment and redeploy, OR
tell operators to run `localStorage.removeItem("authz_r1")` in their
browser console. With the flag off:

- `useAuthzState()` returns a stable null-state and issues zero RPC calls.
- `usePermissions` no longer re-runs on fingerprint changes; its
  dependency list falls back to the pre-R1 tuple.
- `AuthorizationService` receives no `emit` callback; the decision
  path is byte-identical to pre-R1.
- All telemetry counters remain at zero.

## Full removal (only if wave is abandoned)
```
rm src/lib/authz/featureFlags.ts
rm src/lib/authz/telemetry.ts
rm src/lib/authz/telemetry.test.ts
rm src/lib/authz/authzStateClient.ts
rm src/lib/authz/useAuthzState.ts
rm src/lib/authz/authzState.test.ts
git checkout HEAD~ -- src/lib/authz/AuthorizationService.ts \
                     src/lib/authz/useAuthorization.ts \
                     src/hooks/usePermissions.ts
```
No database rollback required — R1 introduces zero schema surface.
