# Plugin Architecture (Design Sketch — Documentation Only)

Read-only architectural sketch of how the platform can host optional modules, plugins, and marketplace extensions without touching current authorization or runtime.

## 1. Layer Model

```
┌──────────────────────────────────────────────┐
│  Marketplace Extensions (specialty modules)  │  ← installable per tenant
├──────────────────────────────────────────────┤
│  Optional Plugins (providers: SMS, storage…) │  ← configured per tenant
├──────────────────────────────────────────────┤
│  Feature Modules (queue, wallet, marketing…) │  ← toggled per tenant
├──────────────────────────────────────────────┤
│  Core Platform (patients, appointments, RBAC)│  ← always on
└──────────────────────────────────────────────┘
```

## 2. Extension Manifest (illustrative)

```
{
  "id": "com.example.dental-chart",
  "name": "Dental Chart",
  "version": "1.0.0",
  "specialty": ["dental", "orthodontics"],
  "permissions_required": ["medical_records.read", "medical_records.write"],
  "surfaces": [
    { "type": "route", "path": "/patients/:id/dental-chart" },
    { "type": "tab", "host": "patient.medical-records", "label": "Dental Chart" }
  ],
  "events_subscribed": ["appointment.completed"],
  "storage_scope": "tenant"
}
```

## 3. Extension Types
- **UI extensions:** routes, tabs, dashboard widgets, list-row actions.
- **Data extensions:** custom fields, custom entities in tenant-scoped tables.
- **Event extensions:** subscribers on platform events (webhook or in-process handler).
- **Provider plugins:** payment, messaging, storage, analytics backends.
- **Report extensions:** additional reports registered into the report catalog.
- Category: `Future Enhancement`.

## 4. Authorization Interop
- Extensions declare **required permissions** from the existing canonical catalog.
- No new permission strings are minted by extensions at runtime; they compose from the canonical taxonomy documented in `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md`.
- Bundle mapping remains centrally managed. Extensions cannot bypass RLS.
- Category: `Improvement Opportunity` (documentation), `Future Enhancement` (implementation).

## 5. Tenant Lifecycle
- Install → grant → configure → enable → disable → uninstall (data retention window).
- All lifecycle events emit audit records.

## 6. Developer Portal (Wave 9)
- Manifest registry, versioning, review pipeline, sandbox tenant, revenue share.
- Category: `Future Enhancement`.

## 7. Non-Goals
- No change to AuthorizationService, bundles, RLS, SECURITY DEFINER functions, or Edge Functions.
- No new global roles.
- No behavioral change to existing modules when extensions are absent.
