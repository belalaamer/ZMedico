# Permission Consolidation Plan

Goal: describe the migration path toward a **single source of truth**
for authorization decisions. **No permission store is deleted, merged,
or altered in Sprint 4** — this is a plan only.

## Current state

Three stores co-exist by design:

1. **`src/lib/rolePermissions.ts`** — TypeScript constant
   (`DEFAULT_PERMISSIONS`) shipped with the frontend bundle.
   - Purpose: hard-coded fallback / seed used when the DB matrix has
     no override for a given `(role, module)` pair.
   - Consumers: `RolePermissions.tsx` (admin UI seed), several
     wrappers that check permission before the DB call resolves.
2. **`public.role_permissions`** table — DB-backed override matrix.
   - Purpose: per-tenant customisation of the default matrix.
   - Written by `settings_save_role_permissions` RPC (transactional).
   - Consumed by `useAuthorization` via `authzStateClient.ts`.
3. **`authz_bundles`** + `authz_bundle_permissions` +
   `authz_role_bundles` — canonical **permission bundle model**
   (V8/V11 target).
   - Purpose: fine-grained permission keys (`patients.view`,
     `settings.pricing.update`, …) grouped into bundles assigned to
     roles.
   - Consumed via `AuthorizationService.ts` and the shadow probes.

## The overlap

- The bundle model is authoritative in V8+.
- The `role_permissions` matrix is the **module-level coarse gate**
  still consulted by `PermissionRoute` and some UI wrappers.
- `DEFAULT_PERMISSIONS` mirrors both, hand-maintained.

This tri-store shape is why the shadow probes exist: they compare
`DEFAULT_PERMISSIONS` (legacy) with `authz_bundles` (canonical) and
report drift.

## Target end-state

Single authoritative source: **`authz_bundles`** + `has_permission()`.
The `role_permissions` table and `DEFAULT_PERMISSIONS` constant become
**derived views** of the bundle model, generated from it — not
independently edited.

## Migration path (documentation only — no code emitted)

### Phase A — Convergence proof (Sprint 4.6)
- Run every shadow-probe slice under production traffic for one
  release window with **zero drift alerts**.
- Add a CI job that fails if any probe emits a drift telemetry event.
- Exit criteria: 14 days of drift-free traces across all 5 slices
  (patients, medical_records, invoices, hr, settings).

### Phase B — Read-side cutover (Sprint 4.7)
- Replace every `DEFAULT_PERMISSIONS` read with a bundle lookup
  through `AuthorizationService`.
- `DEFAULT_PERMISSIONS` becomes a *generated constant*, produced at
  build time from the canonical bundle export, purely to keep the
  fallback path available for offline / hydration edge cases.
- No DB change.

### Phase C — Write-side cutover (Sprint 4.8)
- Deprecate the `RolePermissions.tsx` matrix editor in favour of a
  bundle-first UI.
- Retain `role_permissions` table as a **read-through cache** of
  bundle expansion for one release, then archive.

### Phase D — Store retirement (Sprint 4.9)
- Confirm no reader depends on `public.role_permissions`.
- Convert `role_permissions` into a materialized view over
  `authz_bundles` expansion, or drop it.
- Delete `DEFAULT_PERMISSIONS`.

Each phase is independently deployable and independently reversible.

## Explicit non-actions in Sprint 4

- No rows are inserted/updated/deleted in any authz table.
- No RLS or `SECURITY DEFINER` function is modified.
- No frontend wrapper is switched.
- The shadow probes remain wired exactly as-is.

## Risk

- **Sprint 4 (this doc)**: zero.
- **Phase A**: zero (observational).
- **Phase B**: low (behavior identical if convergence proof holds).
- **Phase C+D**: medium (destructive) — requires standalone approval.
