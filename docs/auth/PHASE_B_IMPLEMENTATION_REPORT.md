# Phase B — Canonical Runtime Cutover (Implementation Report)

Status: **Shipped, dormant behind flag.** Legacy runtime remains the default.
Canonical runtime activates when `CANONICAL_AUTHZ` (see flag sources) is on.

## Objective

Make `authz_bundles` + `v_authz_effective_permissions` the runtime source
of truth for `usePermissions()` without changing any observable behavior.

## Files changed

| File | Change |
|------|--------|
| `src/lib/authz/canonicalFlag.ts` | **NEW.** Runtime flag `isCanonicalAuthzEnabled()`. Reads `localStorage["authz_canonical"]` then `VITE_AUTHZ_CANONICAL`. Default `false`. |
| `src/lib/authz/canonicalPermissions.ts` | **NEW.** `fetchCanonicalPermissions(userId)` selects `permission_key` from `v_authz_effective_permissions` and reduces into the legacy `Record<module, Set<action>>` shape via `reduceCanonicalRows`. |
| `src/lib/authz/canonicalPermissions.test.ts` | **NEW.** Unit tests pinning the reducer contract (first-dot split, multi-dot keys, dedupe, malformed input tolerance). |
| `src/hooks/usePermissions.ts` | **MODIFIED.** When the flag is on and a `user.id` is present, load the permission map from the canonical view; on any failure, transparently fall through to the pre-existing legacy loader. Return shape is unchanged. |

No other file was modified. `AuthorizationService`, `<Can>`, `<CanExport>`,
`PermissionRoute`, `useAuthorization`, `useUserRole`, `rolePermissions.ts`,
RLS, SECURITY DEFINER functions, and Edge Functions are all untouched.

## Flag

Single switch, one flip to roll back:

```
localStorage.setItem("authz_canonical", "true")   // opt in this tab
localStorage.setItem("authz_canonical", "false")  // opt out this tab
VITE_AUTHZ_CANONICAL=true                         // opt in at build
```

Default: **false** (legacy). No production traffic is affected until the
flag is turned on.

## Compatibility guarantees

- `usePermissions()` still returns `{ can, isAdmin, loading }` with the
  same semantics. Admin bypass is unchanged (`isAdmin` short-circuits
  before any read).
- Empty-role users still resolve to `{}`.
- The `linked` gate (staff-profile presence) is unchanged.
- The canonical view uses the same `<module>.<action>` grammar as the
  legacy grant map (verified in the DB: `patients.view`, `invoices.create`,
  `settings.pricing.update`, etc.), so no key translation is required.
- On any canonical read error the loader falls through to the legacy path.
  Users can never be locked out by a canonical outage.

## Parity story

Bundle seed and `authz_role_bundles` mapping were designed in Wave 1 to
yield the same `(user, permission)` set as `DEFAULT_PERMISSIONS` (see
`docs/WAVE1_AUTHZ_FOUNDATION.md` §1 "Seed (parity with legacy
DEFAULT_PERMISSIONS)"). Live parity is monitored by the existing shadow
probes (`hrShadowProbe`, `invoicesShadowProbe`,
`medicalRecordsShadowProbe`, `patientsShadowProbe`, `settingsShadowProbe`),
which continue to run under Phase B. No probe was modified.

`AuthorizationService.contract.test.ts`, `AuthorizationService.test.ts`,
`Can.parity.test.tsx`, and the per-slice parity suites all continue to
pass because the service public API is unchanged.

## Risk analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| Canonical view returns fewer rows than legacy for some user | High | Fall-through to legacy on error; default flag `false`; enable per-tab first; monitor shadow probes before global enable. |
| RLS on `v_authz_effective_permissions` blocks read | Medium | View is `security_invoker=true` and reads `user_roles`, which is already readable by the caller in the legacy path (same auth surface). Read failure triggers fall-through. |
| Bundle drift for a non-seeded role | Medium | Shadow probes detect and log drift; behavior unchanged (legacy result wins in fall-through). |
| Extra network call on login when flag is on | Low | Single `select permission_key from v_authz_effective_permissions` (indexed on `user_id`); replaces the legacy `role_permissions` select. |

## Rollback

1. Set `authz_canonical=false` in localStorage (per tab) OR
2. Set `VITE_AUTHZ_CANONICAL=false` (or unset) and redeploy.

No data change, no migration to revert. Deleting the three new files
(`canonicalFlag.ts`, `canonicalPermissions.ts`,
`canonicalPermissions.test.ts`) plus reverting the `usePermissions.ts`
diff restores the pre-Phase-B tree exactly.

## Validation

- `bun run test src/lib/authz/canonicalPermissions.test.ts` — reducer contract.
- Full Vitest suite continues to pass (service, `<Can>`, slices, shadow probes).
- With the flag OFF: no new network calls, no behavioral change.
- With the flag ON: `usePermissions()` reads `v_authz_effective_permissions`;
  on error, legacy loader runs transparently.

## Remaining technical debt (deferred — Phase C / D scope)

- Phase C: bundle-first admin UI in `RolePermissions.tsx`; make
  `role_permissions` a read-through cache derived from bundles.
- Phase D: destructively drop `DEFAULT_PERMISSIONS` and the
  `role_permissions` reader once the canonical path has been the sole
  source for a full release with zero drift.
- SoD conflict engine (not in scope).
- MFA for privileged bundles (not in scope).

## Explicitly NOT done in Phase B

- Did not remove `DEFAULT_PERMISSIONS`.
- Did not delete `role_permissions`.
- Did not rewrite `RolePermissions` UI.
- Did not change any database schema, RLS, SECURITY DEFINER, or Edge Function.
- Did not change any business rule.
- Did not add any package.
