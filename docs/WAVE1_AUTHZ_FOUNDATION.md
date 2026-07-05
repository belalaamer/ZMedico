# Wave 1 — Authorization Foundation

Status: **Shipped, dormant.** Wave 1 is fully additive. Nothing in the
running application reads from these objects yet; the legacy
`role_permissions` table + `usePermissions` hook + `PermissionRoute`
continue to be the single active authorization path.

This document describes every new object introduced in this wave.

---

## 1. Database objects

All objects live in `public`. Every table has RLS enabled: any signed-in
user can read the catalog, only admins can write to it.

| Object | Kind | Purpose |
|---|---|---|
| `authz_permissions` | table | Canonical permission catalog. PK = permission `key` (e.g. `invoices.create`). Carries display name, group, risk level, default scope, deprecation flag. |
| `authz_bundles` | table | Named collections of permissions. PK = bundle `key` (e.g. `bundle.role.accountant`). |
| `authz_bundle_permissions` | table | Many-to-many: which permissions belong to which bundle. |
| `authz_bundle_implies` | table | Bundle inheritance graph: `parent_bundle_key` implies `child_bundle_key`. Nested bundles are resolved recursively by the view + function. |
| `authz_role_bundles` | table | Assigns bundles to legacy `app_role` values. Wave 1 seeds one bundle per legacy role. |
| `v_authz_effective_permissions` | view | For every user, the flattened set of `(user_id, permission_key)` reachable through their roles → bundles → (implied) bundles → permissions. Filters out deprecated permissions. `security_invoker=true` so it honors the caller's RLS on `user_roles`. |
| `has_permission(user_id uuid, permission_key text)` | function | SECURITY DEFINER. Returns `true` iff the user is admin or reaches the permission via any bundle. **Not yet called by application code.** This is the future canonical backend authorization entry point. |

### Seed (parity with legacy `DEFAULT_PERMISSIONS`)

- One permission per `<module>.<action>` currently used in `src/lib/rolePermissions.ts`.
- One bundle per legacy role: `bundle.role.{admin,manager,doctor,nurse,receptionist,accountant,hr,staff}`.
- Each role bundle contains exactly the actions the legacy defaults grant.
- `admin` bundle contains every non-deprecated permission.
- `authz_role_bundles` maps each legacy `app_role` value to its role bundle 1:1.

Result: `v_authz_effective_permissions` yields the same `(user, permission)`
set as today's UI would compute — no more, no less.

### RLS summary

| Table | Read | Write |
|---|---|---|
| `authz_permissions` | authenticated | admin only |
| `authz_bundles` | authenticated | admin only |
| `authz_bundle_permissions` | authenticated | admin only |
| `authz_bundle_implies` | authenticated | admin only |
| `authz_role_bundles` | authenticated | admin only |

### Function security

`has_permission` is `SECURITY DEFINER` with `search_path = public` (same
pattern as the existing `has_role`). `EXECUTE` is revoked from `public`
and granted only to `authenticated` and `service_role`. The function
only reads catalog + `user_roles`; it never mutates state.

---

## 2. Frontend objects

| File | Purpose |
|---|---|
| `src/lib/authz/AuthorizationService.ts` | Framework-free class exposing the future authorization API: `can(permission)`, `canAny(...)`, `canAll(...)`. Internally delegates to a legacy `(module, action) => boolean` callable so behavior is identical to today. Includes `createAuthorizationServiceFromLegacy(...)` compatibility adapter. |
| `src/lib/authz/useAuthorization.ts` | React hook `useAuthorization()` returning `{ authz, loading, isAdmin }`. Builds the service from the existing `usePermissions` hook. Optional — not required by any component yet. |
| `src/lib/authz/AuthorizationService.test.ts` | Vitest unit tests covering: key parsing, admin bypass, `can` / `canAny` / `canAll`, adapter behavior, and a **parity matrix** asserting the service returns the exact same answer as legacy `DEFAULT_PERMISSIONS` for every role × module × action combination. |

Permission-key format used by the service:

```
<module>.<action>
```

This is a strict subset of the canonical Permission Catalog grammar
(`<group>.<resource>.<action>[.<qualifier>]`). Later waves will migrate
call sites to catalog keys, but at Wave 1 the module-based keys map 1:1
to legacy checks so no behavior drifts.

---

## 3. Compatibility guarantees

- **No existing table, policy, function, or view was modified.**
- **No existing frontend file was modified.**
- The legacy `usePermissions`, `<Can />`, `<PermissionRoute />`, and
  `isAdmin` paths continue to be the *only* code paths that gate UI
  today.
- `has_permission` is defined but not referenced by any RLS policy,
  edge function, or application query.
- All new tables are read-open to authenticated users and write-locked
  to admins, matching the sensitivity of the legacy `role_permissions`
  table.

---

## 4. Verification checklist

- [x] Migration applied cleanly; only pre-existing SECURITY DEFINER
      linter warnings, matching the established `has_role` pattern.
- [x] `v_authz_effective_permissions` returns the expected rows for a
      seeded user in each legacy role.
- [x] Vitest parity suite proves `AuthorizationService.can` returns
      identical results to the legacy `DEFAULT_PERMISSIONS` for every
      role × module × action pair.
- [x] No file under `src/pages`, `src/components`, or
      `src/integrations/supabase` was modified.

---

## 5. What Wave 1 does *not* do

- Does not migrate any UI to `useAuthorization()`.
- Does not change any RLS policy.
- Does not remove or deprecate any legacy permission, role, or table.
- Does not add MFA, break-glass, SoD, or scope resolution — those are
  later waves per `docs/AUTHORIZATION_ARCHITECTURE.md`.

Later waves will:

1. Backfill catalog keys onto every gated UI action.
2. Introduce scope resolution (`own/branch/organization/global`).
3. Migrate RLS policies to consult `has_permission` where safe.
4. Retire the legacy `role_permissions` module-based defaults.