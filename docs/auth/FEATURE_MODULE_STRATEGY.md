# Feature / Module / Permission / Bundle Strategy

**Mode:** Documentation only.

**Purpose:** Disambiguate four terms that are often conflated and
explain why they must remain independent.

---

## 1. Definitions

| Concept | What it answers | Owner | Lives in |
|---|---|---|---|
| **Feature** | *Is this capability enabled for this tenant/branch/plan?* | Product / Billing | Feature flags |
| **Module** | *Is this product surface (page, workflow, nav entry) visible?* | Product | Feature flags + routing |
| **Permission** | *Is this user allowed to perform this action?* | Platform | `authz_permissions` |
| **Bundle** | *Which set of permissions travels together?* | Platform | `authz_bundles` (+ `authz_bundle_permissions`, `authz_bundle_implies`) |

---

## 2. Why They Must Stay Independent

### 2.1 Different lifecycles
- Features churn with commercial packaging (plans, trials, add-ons).
- Modules churn with UX iterations.
- Permissions churn only under the additive migration protocol.
- Bundles churn under governance review.

Coupling them freezes the slow layers to the fastest one.

### 2.2 Different owners
- Product owns Feature/Module.
- Platform / Security owns Permission/Bundle.
- Mixing ownership creates authorization drift and shadow-probe
  failures.

### 2.3 Different failure modes
- A missing Feature -> UI hidden; safe.
- A missing Module -> route 404; safe.
- A missing Permission -> data leak or denial; unsafe.
- A missing Bundle -> role loses capability; unsafe.

Keeping them independent lets each layer be tested in isolation.

### 2.4 Composability
A single Permission may appear in many Bundles. A single Bundle may
be granted by many Roles. A single Module may require several
Permissions. A single Feature may enable several Modules. Collapsing
any pair loses this many-to-many expressiveness.

---

## 3. Interaction Rules

1. **Feature gates come first.** If a Feature is off, the UI does not
   render — regardless of Permission.
2. **Permission gates enforce authorization.** If the Permission is
   absent, the action is denied — regardless of Feature.
3. **Both must pass** for a protected action to execute.
4. **Bundles never reference Features.** Bundle composition is
   independent of tenant plan.
5. **Features never reference Permissions.** Feature flags do not
   grant capability; they only surface it.
6. **Modules bind to Permissions declaratively** (`PermissionRoute`)
   and to Features declaratively (future `FeatureRoute`). The two
   gates compose; they do not merge.

---

## 4. Anti-Patterns (do not do)

- ❌ `if (isDentalTenant) permissions.push('odontogram.write')`
- ❌ `bundle.role.doctor.grants = feature.enabled('telemedicine')
      ? [...base, 'video.session.start'] : base`
- ❌ Feature flags named after permission keys.
- ❌ Permissions named after commercial plans (`premium.export`).
- ❌ Modules that silently grant permissions.

---

## 5. Correct Pattern

```
<FeatureRoute feature="feature.module.inventory">
  <PermissionRoute permission="inventory.view">
    <InventoryPage />
  </PermissionRoute>
</FeatureRoute>
```

- Feature answers "is this offered?"
- Permission answers "is this allowed?"
- Bundle answers "who is allowed?"
- Module answers "where does it appear?"

Four questions, four answers, four independent layers.
