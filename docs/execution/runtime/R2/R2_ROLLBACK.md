# R2 — Rollback

R2 introduced **no** schema, RPC, RLS, permission-catalog, bundle, or
`role_permissions` change. Rollback is a pure code revert.

## Steps

1. Revert the R2 commit set (all files under `Files changed` in the
   accompanying migration report).
2. Verify:

   ```
   bunx tsgo --noEmit
   bunx vitest run
   ```

3. No database migration, no feature flag, no user session action.

## Blast radius

Reverting R2 restores the prior mix of `usePermissions()` / `useUserRole()`
call sites verbatim. Authorization decisions were already byte-identical
before and after R2, so revert is silent for end users.

## Non-rollback failure modes

If R2 must be *partially* reverted (single file), simply restore that
file's prior imports and expressions from git history — no cross-file
coordination is required because each call-site migration is independent.