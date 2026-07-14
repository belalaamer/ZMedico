# Phase B.1 — Canonical Permission Parity Repair

Status: **Complete.** Non-admin canonical bundles now produce byte-for-byte
the same effective permission set as the legacy `DEFAULT_PERMISSIONS`
map. Admin achieves functional parity via the runtime admin bypass.

Scope of change: **data only** in `authz_role_bundles` and
`authz_bundle_permissions`. No schema change, no catalog change, no
RLS change, no SECURITY DEFINER change, no Edge Function change, no
code change (all runtime files listed in the charter were left
untouched).

## Root causes

| Role | Drift | Root cause |
|------|-------|-----------|
| nurse | Canonical produced 0 permissions | `bundle.role.nurse` existed and was correctly populated with all 10 legacy permissions, but **no row in `authz_role_bundles`** linked the `nurse` app_role to it. `v_authz_effective_permissions` therefore returned zero rows for nurses. |
| manager | 4 canonical extras | Bundle had been seeded with catalog-only fine-grained keys that never existed in `DEFAULT_PERMISSIONS.manager`: `inventory.alerts.manage`, `invoices.coupon.apply`, `settings.branch.update`, `treasury.daily_close.view`. |
| receptionist | 2 canonical extras | Same class of drift: `invoices.coupon.apply`, `treasury.tx.write`. |
| accountant | 3 canonical extras | Same: `invoices.coupon.apply`, `settings.pricing.update`, `treasury.daily_close.view`. The aspirational comment in `rolePermissions.ts` about accountant reaching `settings.pricing.update` is not backed by any legacy grant; strict parity requires removal from canonical. |
| admin | Fine-grained keys instead of module × action product | Intentional catalog design. Admin bypass short-circuits every `can()` decision (`if (isAdmin) return true`) so bundle contents never gate an admin request. Functional parity is 100%; count parity is out of scope of this repair per charter ("Only guarantee functional equivalence"). |
| doctor / hr / staff | none | Already at parity — no action taken. |

## Fixes applied (data only)

```sql
-- 1. Nurse role → nurse bundle linkage
INSERT INTO authz_role_bundles(role, bundle_key)
VALUES ('nurse','bundle.role.nurse')
ON CONFLICT DO NOTHING;

-- 2. Manager: remove 4 extras
DELETE FROM authz_bundle_permissions
WHERE bundle_key='bundle.role.manager'
  AND permission_key IN (
    'inventory.alerts.manage',
    'invoices.coupon.apply',
    'settings.branch.update',
    'treasury.daily_close.view'
  );

-- 3. Receptionist: remove 2 extras
DELETE FROM authz_bundle_permissions
WHERE bundle_key='bundle.role.receptionist'
  AND permission_key IN (
    'invoices.coupon.apply',
    'treasury.tx.write'
  );

-- 4. Accountant: remove 3 extras
DELETE FROM authz_bundle_permissions
WHERE bundle_key='bundle.role.accountant'
  AND permission_key IN (
    'invoices.coupon.apply',
    'settings.pricing.update',
    'treasury.daily_close.view'
  );
```

No catalog permission was added or removed. No bundle was created or
deleted. No `authz_bundle_implies` edge exists — the graph is empty, so
bundle-level deletions fully propagate to `v_authz_effective_permissions`.

## Per-role diff (before repair)

### Manager — extras removed

| Permission | Legacy | Canonical (before) | Canonical (after) |
|------------|:------:|:------------------:|:-----------------:|
| inventory.alerts.manage | ✗ | ✓ | ✗ |
| invoices.coupon.apply   | ✗ | ✓ | ✗ |
| settings.branch.update  | ✗ | ✓ | ✗ |
| treasury.daily_close.view | ✗ | ✓ | ✗ |

Missing: none.

### Receptionist — extras removed

| Permission | Legacy | Canonical (before) | Canonical (after) |
|------------|:------:|:------------------:|:-----------------:|
| invoices.coupon.apply | ✗ | ✓ | ✗ |
| treasury.tx.write     | ✗ | ✓ | ✗ |

Missing: none.

### Accountant — extras removed

| Permission | Legacy | Canonical (before) | Canonical (after) |
|------------|:------:|:------------------:|:-----------------:|
| invoices.coupon.apply     | ✗ | ✓ | ✗ |
| settings.pricing.update   | ✗ | ✓ | ✗ |
| treasury.daily_close.view | ✗ | ✓ | ✗ |

Missing: none.

### Nurse — role linkage added

| Permission | Legacy | Canonical (before) | Canonical (after) |
|------------|:------:|:------------------:|:-----------------:|
| patients.view | ✓ | ✗ | ✓ |
| appointments.view | ✓ | ✗ | ✓ |
| appointments.create | ✓ | ✗ | ✓ |
| appointments.edit | ✓ | ✗ | ✓ |
| medical_records.view | ✓ | ✗ | ✓ |
| vitals.view | ✓ | ✗ | ✓ |
| vitals.create | ✓ | ✗ | ✓ |
| vitals.edit | ✓ | ✗ | ✓ |
| treatment_plans.view | ✓ | ✗ | ✓ |
| inventory.view | ✓ | ✗ | ✓ |

## Bundle mapping (after repair)

| App role | Bundle | Permissions |
|----------|--------|-------------|
| admin | `bundle.role.admin` | 78 fine-grained (runtime uses admin bypass) |
| manager | `bundle.role.manager` | 33 |
| doctor | `bundle.role.doctor` | 16 |
| nurse | `bundle.role.nurse` | 10 |
| receptionist | `bundle.role.receptionist` | 10 |
| accountant | `bundle.role.accountant` | 25 |
| hr | `bundle.role.hr` | 7 |
| staff | `bundle.role.staff` | 1 |

## Verification — parity table

Live DB counts after repair (`SELECT rb.role, count(bp.permission_key)
FROM authz_role_bundles rb LEFT JOIN authz_bundle_permissions bp ON
bp.bundle_key=rb.bundle_key GROUP BY rb.role`):

| Role | Legacy Count | Canonical Count | Match |
|------|:------------:|:---------------:|:-----:|
| admin | 85 (17 modules × 5 actions) | 78 fine-grained | **100% functional** (admin bypass; no `can()` reads the map) |
| manager | 33 | 33 | **100%** |
| doctor | 16 | 16 | **100%** |
| nurse | 10 | 10 | **100%** |
| receptionist | 10 | 10 | **100%** |
| accountant | 25 | 25 | **100%** |
| hr | 7 | 7 | **100%** |
| staff | 1 | 1 | **100%** |

Runtime-effective parity: **100% for every role.**

## Runtime files verified UNCHANGED

- `src/lib/authz/AuthorizationService.ts`
- `src/components/PermissionRoute.tsx`
- `src/components/Can.tsx`
- `src/components/CanExport.tsx`
- `src/lib/authz/useAuthorization.ts`
- `src/hooks/usePermissions.ts`
- `src/components/layout/Sidebar.tsx`, navigation, `src/lib/exportGuard.ts`
- All shadow probes (`hrShadowProbe`, `invoicesShadowProbe`,
  `medicalRecordsShadowProbe`, `patientsShadowProbe`,
  `settingsShadowProbe`)
- `src/lib/rolePermissions.ts` (`DEFAULT_PERMISSIONS`), `role_permissions` table
- RLS, SECURITY DEFINER functions, Edge Functions

## Rollback

All changes are 9 rows of pure data. Restore the previous state with:

```sql
-- Undo nurse linkage
DELETE FROM authz_role_bundles WHERE role='nurse' AND bundle_key='bundle.role.nurse';

-- Restore manager extras
INSERT INTO authz_bundle_permissions(bundle_key, permission_key) VALUES
  ('bundle.role.manager','inventory.alerts.manage'),
  ('bundle.role.manager','invoices.coupon.apply'),
  ('bundle.role.manager','settings.branch.update'),
  ('bundle.role.manager','treasury.daily_close.view')
ON CONFLICT DO NOTHING;

-- Restore receptionist extras
INSERT INTO authz_bundle_permissions(bundle_key, permission_key) VALUES
  ('bundle.role.receptionist','invoices.coupon.apply'),
  ('bundle.role.receptionist','treasury.tx.write')
ON CONFLICT DO NOTHING;

-- Restore accountant extras
INSERT INTO authz_bundle_permissions(bundle_key, permission_key) VALUES
  ('bundle.role.accountant','invoices.coupon.apply'),
  ('bundle.role.accountant','settings.pricing.update'),
  ('bundle.role.accountant','treasury.daily_close.view')
ON CONFLICT DO NOTHING;
```

## Final parity

**100% runtime-effective permission parity across all 8 roles.** The
`authz_canonical` feature flag remains OFF by default; enabling it now
produces the same authorization decisions as the legacy path for every
role, with zero privilege gain and zero privilege loss.
