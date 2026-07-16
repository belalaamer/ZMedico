# White-Label Strategy

Read-only. Turns the platform into a resellable, brandable product without changing authorization or runtime.

## 1. Branding Surface
- Tenant-scoped theme (logo, favicon, primary/secondary/accent, radius, typography) written into the existing CSS token layer in `src/index.css`.
- Login / auth screens accept per-tenant branding via subdomain or path resolution.
- Email templates parameterized with tenant sender identity and brand block.
- PDF templates (invoices, prescriptions) parameterized with tenant header/footer.
- Category: `Improvement Opportunity`.

## 2. Domain Strategy
- Default: `<tenant>.app.example.com`.
- Optional: custom domain per tenant with managed TLS.
- Optional: partner reseller domain (`app.<partner>.com`) hosting many tenants.
- Category: `Future Enhancement`.

## 3. Content White-Label
- Product name, help URLs, support email, legal URLs (ToS, DPA, BAA) are tenant/partner variables.
- No product name is hardcoded in user-visible copy after Wave 3; existing i18n dictionaries become the single source of truth.
- Category: `Improvement Opportunity`.

## 4. Reseller Model
- Two-tier tenancy: Partner → Tenant.
- Partner-scoped admin console (list tenants, provision, suspend, view invoices).
- Revenue share configuration.
- Category: `Enterprise Only`.

## 5. What Stays Unbranded (Vendor Neutral)
- Terminology: "clinic", "practitioner", "patient", "appointment", "visit", "invoice" — all generic.
- Specialty-specific modules ship as marketplace extensions (see `PLUGIN_ARCHITECTURE.md`).
- Category: `Already Excellent`.

## 6. Non-Goals
- No runtime authorization change.
- No new roles created for white-label — existing bundles suffice; partner-admin is a delegated scope layered later (Post-Phase-C, Enterprise Only).
