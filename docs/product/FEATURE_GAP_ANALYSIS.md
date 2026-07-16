# Feature Gap Analysis

Read-only. Categories: `Already Excellent` · `Improvement Opportunity` · `Future Enhancement` · `Optional Plugin` · `Enterprise Only` · `Small Clinic Only`.

## 1. Enterprise Gaps

| # | Gap | Category |
|---|-----|----------|
| E-01 | SSO (SAML/OIDC) and SCIM user provisioning | Enterprise Only |
| E-02 | MFA / step-up auth UI | Enterprise Only |
| E-03 | Delegated admin scopes, time-boxed grants | Enterprise Only |
| E-04 | Franchise / organization tier above branches | Enterprise Only |
| E-05 | Custom fields on core entities (patients, appointments, invoices) | Enterprise Only |
| E-06 | Dynamic form / intake builder per specialty | Enterprise Only |
| E-07 | Workflow / automation builder (triggers → actions) | Enterprise Only |
| E-08 | User-defined report builder + scheduled delivery | Enterprise Only |
| E-09 | Approval workflows (expenses, refunds, discounts, PO) | Enterprise Only |
| E-10 | E-signature and immutable clinical signing | Enterprise Only |
| E-11 | ICD-10 / SNOMED / CPT / LOINC coding hooks | Enterprise Only |
| E-12 | Controlled substance ledger, lot/batch/expiry, barcode scanning | Enterprise Only |
| E-13 | Payroll, leave accruals, performance reviews | Enterprise Only |
| E-14 | Audit viewer UI + tamper-evident export | Enterprise Only |
| E-15 | Retention policy configuration UI | Enterprise Only |
| E-16 | Public REST/GraphQL API + webhooks | Enterprise Only |

## 2. Small Clinic Gaps

| # | Gap | Category |
|---|-----|----------|
| S-01 | Setup wizard (first-run onboarding) | Small Clinic Only |
| S-02 | Simplified navigation profile (hide treasury/wallet/GPS/audit) | Small Clinic Only |
| S-03 | Solo-practitioner defaults (single branch, single room) | Small Clinic Only |
| S-04 | Quick-book flow (patient + appointment in one screen) | Improvement Opportunity |
| S-05 | Printable daily schedule and cash sheet | Improvement Opportunity |
| S-06 | In-app help and tooltips for jargon | Improvement Opportunity |

## 3. UX Gaps

| # | Gap | Category |
|---|-----|----------|
| UX-01 | Empty-state coaching per module | Improvement Opportunity |
| UX-02 | Global command palette (⌘K) parity with sidebar | Improvement Opportunity |
| UX-03 | Consistent bulk-action affordances across lists | Improvement Opportunity |
| UX-04 | Inline validation and undo on destructive actions | Improvement Opportunity |
| UX-05 | Role-specific dashboards | Improvement Opportunity |
| UX-06 | Notification preference center | Improvement Opportunity |

## 4. Configuration Gaps

| # | Gap | Category |
|---|-----|----------|
| C-01 | Per-tenant feature flag panel | Future Enhancement |
| C-02 | Branding / theme editor (logo, colors, typography) | Future Enhancement |
| C-03 | Custom fields registry UI | Future Enhancement |
| C-04 | Tenant-configurable statuses, taxonomies, taxes | Future Enhancement |
| C-05 | Currency and locale profile per tenant/branch | Improvement Opportunity |
| C-06 | Number/date/time format profiles | Improvement Opportunity |

## 5. Features That Should Become Optional Modules

| # | Feature | Category |
|---|---------|----------|
| M-01 | Wallet / prepaid credit | Optional Plugin |
| M-02 | GPS attendance | Optional Plugin |
| M-03 | Queue self-audit + alert engine | Optional Plugin |
| M-04 | Marketing (coupons, campaigns, win-back) | Optional Plugin |
| M-05 | Insurance contracts | Optional Plugin |
| M-06 | Treatment plans (specialty-dependent) | Optional Plugin |
| M-07 | Multi-branch | Optional Plugin |

## 6. Features That Should Become Plugins

| # | Feature | Category |
|---|---------|----------|
| P-01 | Payment gateways (Stripe, Paddle, MyFatoorah, local) | Optional Plugin |
| P-02 | Messaging providers (Twilio, MessageBird, Meta WABA, SendGrid) | Optional Plugin |
| P-03 | Storage backends (S3, GCS, Azure Blob) | Optional Plugin |
| P-04 | Analytics forwarders (GA4, Mixpanel, PostHog) | Optional Plugin |
| P-05 | EHR/HIS interop (HL7 v2, FHIR R4) | Optional Plugin |

## 7. Features That Should Become Marketplace Extensions

| # | Extension | Category |
|---|-----------|----------|
| X-01 | Dental chart module | Marketplace Extension |
| X-02 | Ophthalmology exam module | Marketplace Extension |
| X-03 | Radiology PACS viewer | Marketplace Extension |
| X-04 | Laboratory result panels + LIS bridge | Marketplace Extension |
| X-05 | Physiotherapy exercise library | Marketplace Extension |
| X-06 | Dermatology photo tracking | Marketplace Extension |
| X-07 | Cosmetic surgery consent + before/after gallery | Marketplace Extension |

## 8. Healthcare Compliance Gaps

| # | Gap | Category |
|---|-----|----------|
| H-01 | HIPAA-grade BAA templates and configuration | Enterprise Only |
| H-02 | GDPR data subject request UI (export/delete) | Improvement Opportunity |
| H-03 | Consent registry per patient per purpose | Improvement Opportunity |
| H-04 | Retention/erasure policy UI | Enterprise Only |
| H-05 | Break-glass emergency access workflow | Enterprise Only |
| H-06 | Signed audit log export | Enterprise Only |

None of the above changes current authorization or runtime behavior.
