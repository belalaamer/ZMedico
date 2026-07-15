# Platform Authorization Model

**Mode:** Documentation only. No runtime, RLS, SECURITY DEFINER, Edge
Function, feature-flag, bundle, permission, or `AuthorizationService`
change. Every production decision remains byte-identical.

**Purpose:** Describe the authorization system as a *reusable platform*
that any healthcare-adjacent business — clinic, hospital, laboratory,
radiology center, dental clinic, physiotherapy center, veterinary
clinic, beauty clinic, pharmacy, telemedicine provider, optical shop,
mental-health practice, emergency service — can adopt without touching
the engine.

---

## 1. Layered Architecture

Ten orthogonal layers. Each has one responsibility and depends only on
the layers below it. No layer names a medical specialty; specialty is a
configuration concern in the Feature and Tenant layers.

```
10. Organization Layer   (legal entity, brand, contracts)
 9. Tenant Layer         (isolated data + config domain)
 8. Branch Layer         (physical/virtual site of service)
 7. Feature Layer        (product surfaces toggled per tenant/branch/plan)
 6. Scope Layer          (own / branch / org / global)
 5. Permission Layer     (atomic capability keys)
 4. Bundle Layer         (named grant sets, composable)
 3. Role Layer           (business role -> bundle mapping)
 2. User Layer           (identity <-> role assignments)
 1. Identity Layer       (authenticated principal)
```

Context flows top-to-bottom (which tenant / branch / features are
active); decisions flow bottom-to-top (does this identity, through its
roles -> bundles -> permissions, satisfy the required key within the
active scope?).

---

## 2. Layer Definitions

### 2.1 Identity Layer
- **Responsibility:** Establish *who* is making the request.
- **Inputs:** Authenticated principal from the IdP (email/password,
  Google OAuth, SAML, magic link, service token).
- **Outputs:** Stable `user_id` (UUID) + session claims.
- **Guarantees:** No authorization decision. Purely authentication.
- **Extensibility:** Additional IdPs (SSO, SCIM) plug in here without
  affecting any higher layer.

### 2.2 User Layer
- **Responsibility:** Represent the account behind an identity —
  profile, employment status, tenant membership, branch memberships,
  role assignments.
- **Inputs:** `user_id`.
- **Outputs:** Active role set, tenant, branch context.
- **Guarantees:** No permission evaluation. Only membership.
- **Extensibility:** Multi-tenant users, guest users, patient-portal
  users, and API service accounts all live here without new
  authorization primitives.

### 2.3 Role Layer
- **Responsibility:** Name a business role (admin, manager, doctor,
  nurse, receptionist, accountant, hr, staff — plus future roles
  such as radiologist-tech, lab-tech, pharmacist, groomer,
  optometrist).
- **Inputs:** Role identifier per user.
- **Outputs:** Bundle references via `authz_role_bundles`.
- **Guarantees:** Roles carry no permissions directly; they point at
  bundles.
- **Extensibility:** New roles are additive rows; no engine change.

### 2.4 Bundle Layer
- **Responsibility:** Named, reusable grant sets. Composable via
  `authz_bundle_implies` (reducer already flattens).
- **Guarantees:** Bundles carry no role identity. A bundle is a
  capability, not a job title.
- **Extensibility:** Capability bundles
  (`bundle.<domain>.<capability>`) let new roles compose from
  existing building blocks.

### 2.5 Permission Layer
- **Responsibility:** Atomic capability keys following the grammar
  `<domain>.<resource>.<action>[.<scope>]` (or two-segment shorthand
  when domain == resource).
- **Outputs:** Boolean grant via `has_permission()` /
  `AuthorizationService.can()`.
- **Guarantees:** Vendor-neutral (see
  UNIVERSAL_AUTHORIZATION_TAXONOMY). No specialty noun ever appears
  in a key.

### 2.6 Scope Layer
- **Responsibility:** Bound the reach of a granted permission — `own`,
  `branch`, `org`, `global`.
- **Inputs:** `default_scope` on bundle grants + request context
  (active branch).
- **Guarantees:** Today `default_scope` is enforced by RLS and the
  canonical runtime. Encoding scope *into* keys is a **future** ADR
  (blocked; would be behavioural).

### 2.7 Feature Layer
- **Responsibility:** Toggle product surfaces (modules, pages,
  workflows, dashboards) independently of permissions. Enables
  specialty add-ons (odontogram, DICOM viewer, dispensary, boarding
  calendar) without affecting authorization keys.
- **Guarantees:** A feature toggle never grants a permission and a
  permission never enables a feature. Two independent axes.

### 2.8 Tenant Layer
- **Responsibility:** Isolate data + configuration for one customer.
  Owns the clinic-type setting (`general`, `dental`, `physiotherapy`,
  `dermatology`, `radiology`, `laboratory`, `pharmacy`, `veterinary`,
  `optical`, `telemedicine`, `mental_health`, `emergency`, ...).
- **Guarantees:** Clinic type never gates a permission key.

### 2.9 Branch Layer
- **Responsibility:** Physical or virtual site of service. Anchors
  branch-scoped permissions and rosters.

### 2.10 Organization Layer
- **Responsibility:** Legal entity / brand grouping one or more
  tenants (e.g. a hospital group operating a dental tenant and a
  radiology tenant). Anchors cross-tenant reporting and central
  administration. Reserved for future ABAC / delegated-admin work.

---

## 3. Relationships

```
Organization 1--* Tenant 1--* Branch 1--* User
                      |              |
                      |              +-- Feature toggles (per branch)
                      +-- Feature toggles (per tenant)

User *--* Role *--* Bundle *--* Permission
                        |
                        +-- Bundle *--* Bundle   (composition / implies)

Decision(user, key, context) =
    exists role in user.roles :
    exists bundle in closure(role.bundles) :
    key in bundle.permissions
    AND scope_satisfied(bundle.default_scope, context)
    AND feature_enabled(context.tenant, context.branch, key.feature_binding)
```

Invariants:

1. **No downward leakage.** A higher layer never reads state owned by
   a lower layer directly; it consults the layer immediately below.
2. **No upward coupling.** A lower layer never names concepts from a
   higher layer. Permissions don't know about tenants; bundles don't
   know about organizations; roles don't know about features.

---

## 4. Runtime Preservation

Every current production behaviour — legacy fallback, admin bypass,
shadow probes, `AuthorizationService`, `usePermissions`,
`PermissionRoute`, `Can`, `CanExport`, RLS policies, SECURITY DEFINER
functions, Edge Functions — remains byte-identical.
