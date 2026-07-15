# Tenant Customization Strategy

**Mode:** Documentation only. No runtime, RLS, SECURITY DEFINER, Edge
Function, feature-flag, bundle, or permission change.

**Purpose:** Define how customers customize their deployment — role
labels, bundle labels, default bundles, module visibility, specialty
modules — **without** modifying permission keys, engine code, or
authorization decisions.

---

## 1. Customization Axes

| Axis | Customizable? | Storage | Runtime impact |
|---|---|---|---|
| Permission keys | **No** | `authz_permissions` (platform-owned) | None |
| Bundle grants (which keys a bundle grants) | Platform-owned | `authz_bundle_permissions` | None |
| Role -> bundle mapping | Platform default; tenant may override via future admin UI | `authz_role_bundles` | Already supported |
| Role display name | **Yes** | Tenant `role_labels` map | UI only |
| Bundle display name | **Yes** | Tenant `bundle_labels` map | UI only |
| Default bundles per role | **Yes** (tenant may add extra bundles) | `authz_role_bundles` rows scoped by tenant | Additive |
| Module visibility | **Yes** | Feature flags per tenant/branch | UI only |
| Specialty modules | **Yes** | Feature flags + tenant `clinic_type` | UI only |
| Localization | **Yes** | i18n resource bundles | UI only |

Rule: **anything that changes what a key means is platform-owned;
anything that changes how it is labelled or surfaced is
tenant-owned.**

---

## 2. Role Name Customization

The role identifier (e.g. `doctor`) is a stable platform token. Its
display label is a per-tenant string.

```
role.doctor     -> "Physician"        (US clinic)
role.doctor     -> "Consultant"       (UK hospital)
role.doctor     -> "Veterinarian"     (vet practice)
role.doctor     -> "Dentist"          (dental clinic)
```

The permission engine only sees `doctor`. The UI resolves the label
via the tenant's `role_labels` map, falling back to the platform
default.

---

## 3. Bundle Name Customization

Same pattern:

```
bundle.role.doctor  -> "Physician Access"
bundle.role.nurse   -> "Nursing Access"
bundle.clinical.writer -> "Clinical Documentation"
```

Renaming a bundle in the UI never touches its key or its grants.

---

## 4. Default Bundle Customization

Tenants may **add** bundles to a role. They may not **remove**
platform-defined baseline bundles (that would break invariants
asserted by shadow probes). Precedence:

```
Effective bundles(role, tenant) =
    platform_baseline(role)
  ∪ tenant_extension(role, tenant)
```

Tenant extensions live in the same `authz_role_bundles` table with a
tenant_id column (future — additive; today all rows are global).

---

## 5. Module Visibility

Modules are Feature-Layer concerns. A tenant may hide any module
without revoking underlying permissions — the permission stays valid
if the module is re-enabled later.

```
feature.module.inventory      = true
feature.module.hr             = true
feature.module.telemedicine   = false   # not licensed
feature.module.odontogram     = false   # not a dental tenant
```

Feature checks are separate from `Can` / `PermissionRoute` checks.
Route gates typically require **both**:

```
FeatureRoute(feature.module.inventory)
  -> PermissionRoute(inventory.view)
    -> <InventoryPage />
```

---

## 6. Specialty Modules

Specialty surfaces are shipped as optional feature bundles:

| Specialty | Feature bundle | Enables |
|---|---|---|
| Dental | `feature.pack.dental` | odontogram, perio chart, ortho |
| Radiology | `feature.pack.radiology` | DICOM viewer, imaging orders |
| Laboratory | `feature.pack.lab` | test catalog, specimen tracking |
| Pharmacy | `feature.pack.pharmacy` | dispensary, controlled ledger |
| Veterinary | `feature.pack.vet` | species, vaccination, boarding |
| Telemedicine | `feature.pack.telehealth` | video sessions |
| Optical | `feature.pack.optical` | refraction, frames inventory |

Enabling a feature pack surfaces its UI. It never grants a
permission. Permissions are still granted through bundles.

---

## 7. What Tenants CANNOT Customize

- Permission keys (grammar, additions, deletions).
- Bundle contents (which keys a bundle grants).
- RLS policies.
- SECURITY DEFINER functions.
- Edge Functions.
- Scope semantics (`own` / `branch` / `org` / `global`).
- Feature-flag rollout mechanics.
- Shadow-probe baselines.

Attempting to customize any of the above requires a platform
migration under the standard additive protocol.

---

## 8. Guarantees

- Zero runtime behaviour change from any tenant customization above.
- Role/bundle labels are pure UI concerns.
- Default-bundle extensions are additive; baseline decisions
  preserved.
- Feature toggles cannot escalate privilege.
