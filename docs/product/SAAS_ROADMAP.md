# SaaS Roadmap

Documentation-only. Sequenced waves that turn the current product into a full multi-tenant SaaS platform. Each wave is scoped so it does not alter current authorization or runtime behavior; it adds new surfaces around them.

## Wave 0 — Baseline (Complete)
- Canonical RBAC runtime, bundles, RLS, audit, AR/EN i18n, mobile shell. `Already Excellent`.

## Wave 1 — Tenant Foundation
- Tenant registry & lifecycle (provision, suspend, export, delete).
- Per-tenant feature flag panel wrapping existing flag mechanics.
- Setup wizard (branding, branches, first user, first services).
- Category: `Future Enhancement`.

## Wave 2 — Subscription & Billing
- Plan catalog (Solo, Clinic, Multi-Branch, Enterprise).
- Metered add-ons (SMS bundles, WhatsApp, storage).
- Billing provider abstraction (Stripe / Paddle / MyFatoorah).
- Dunning, invoices, tax profiles for tenant billing (distinct from clinic → patient billing).
- Category: `Future Enhancement`.

## Wave 3 — White-Label
- Theming editor (logo, palette, typography) writing to existing CSS token layer.
- Custom domain per tenant.
- Email sender identity per tenant.
- Category: `Improvement Opportunity`.

## Wave 4 — Configurability
- Custom fields registry (patients, appointments, invoices, medical records).
- Dynamic intake / consent form builder.
- Tenant-configurable statuses and taxonomies.
- Category: `Future Enhancement`.

## Wave 5 — Automation & Reporting
- Workflow builder (trigger → condition → action).
- Report builder + scheduled email delivery.
- Notification preference center.
- Category: `Future Enhancement`.

## Wave 6 — Compliance Surface
- Consent registry per patient per purpose.
- Retention & erasure policy UI.
- GDPR data subject request export/delete UI.
- Audit viewer + signed export.
- Category: `Improvement Opportunity` → `Enterprise Only`.

## Wave 7 — Specialty Modules (Marketplace)
- Dental chart, ophthalmology exam, dermatology photo, physiotherapy exercises, plastic surgery consent gallery, radiology PACS bridge, laboratory panels.
- Category: `Optional Plugin` / `Marketplace Extension`.

## Wave 8 — Enterprise Identity & Governance
- SSO/SAML, OIDC, SCIM.
- MFA UI, delegated admin scopes, time-boxed grants, break-glass.
- Franchise / organization tier above branches.
- Category: `Enterprise Only`. Aligns with hardening review F-1–F-12 (Post-Phase-C for behavioral items).

## Wave 9 — Platform / Developer
- Public REST + GraphQL API, webhooks, event bus.
- Plugin manifest, extension marketplace, developer portal.
- Category: `Future Enhancement`.

## Sequencing Notes
- Waves 1–3 unlock open self-serve SaaS.
- Waves 4–6 unlock enterprise sales.
- Waves 7–9 unlock platform strategy and ecosystem revenue.
- No wave touches AuthorizationService, bundles, RLS, SECURITY DEFINER functions, or Edge Functions in ways that alter current authorization decisions.
