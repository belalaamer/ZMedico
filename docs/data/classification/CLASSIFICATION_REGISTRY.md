# PHI / PII Classification Registry (V13 Foundation)

**Sprint 3 — Documentation Only.** No `COMMENT ON COLUMN` migrations are
applied. Section 4 documents the future migration script for governance
approval.

## 1. Classification Levels

| Tag              | Definition                                                                                          | Regulatory Driver | Access Default |
|------------------|-----------------------------------------------------------------------------------------------------|-------------------|----------------|
| `PUBLIC`         | Non-sensitive; safe for anonymous view.                                                             | —                 | anon + auth    |
| `INTERNAL`       | Operational data with no direct subject linkage (IDs, timestamps, foreign keys).                    | —                 | authenticated  |
| `PII`            | Directly identifies a natural person (name, email, phone, address).                                 | GDPR              | role-gated     |
| `PII-SENSITIVE`  | Special-category identifier (national ID, passport, government number).                             | GDPR Art. 9-adj   | role-gated + audited |
| `PHI`            | Protected Health Information — clinical, diagnostic, or physiological data.                         | HIPAA / GDPR Art. 9 | role-gated + audited |
| `PHI-LINK`       | Foreign key referencing a PHI aggregate. Not PHI by itself, but leaking it enables re-identification.| HIPAA safe-harbor | role-gated     |
| `FINANCIAL`      | Monetary values, invoices, payments, wallets.                                                       | SOX-adj / PCI-adj | role-gated + audited |
| `PCI`            | Cardholder data or tokens. **Not currently stored** by ZMedico; reserved.                           | PCI-DSS           | forbidden in DB |
| `AUDIT`          | Immutable audit trail; append-only.                                                                 | HIPAA / SOX       | admin + DPO    |

## 2. Aggregate → Field Classification

### 2.1 Patient (`public.patients`)

| Field                 | Class            | Notes |
|-----------------------|------------------|-------|
| id, tenant_id, branch_id | INTERNAL      | Identifier only |
| patient_code          | PII              | Deterministic; treat as identifier |
| first_name_*, last_name_* | PII          | Bilingual pairs share classification |
| date_of_birth         | PHI              | Quasi-identifier |
| gender                | PHI              | |
| national_id           | PII-SENSITIVE    | Never emit in exports without DPO approval |
| phone, email, address | PII              | |
| blood_group, allergies, chronic_diseases, notes | PHI | |
| created_by, created_at, updated_at, deleted_at | INTERNAL | |

### 2.2 Appointment (`public.appointments`)

| Field | Class |
|-------|-------|
| id, tenant_id, branch_id, doctor_id, service_id | INTERNAL |
| patient_id | PHI-LINK |
| start_at, end_at, status, priority, checked_in_at, started_at | INTERNAL (schedule metadata) |
| notes | PHI |
| audit columns | INTERNAL |

### 2.3 Invoice (`public.invoices` + `invoice_items`)

| Field | Class |
|-------|-------|
| id, tenant_id, branch_id, invoice_number | INTERNAL |
| patient_id | PHI-LINK |
| subtotal, discount, tax, total, amount_paid, currency | FINANCIAL |
| items[].* | FINANCIAL (description may be PHI if it names a procedure) |
| audit columns | INTERNAL |

### 2.4 Payment (`public.payments`)

| Field | Class |
|-------|-------|
| id, tenant_id, branch_id, invoice_id | INTERNAL |
| patient_id | PHI-LINK |
| amount, currency, payment_method, reference_number | FINANCIAL |
| received_by, notes | INTERNAL / FINANCIAL |
| audit columns | INTERNAL |

### 2.5 User (`auth.users` + `public.profiles` + `public.user_roles`)

| Field | Class |
|-------|-------|
| id | INTERNAL |
| email | PII |
| full_name, avatar_url | PII |
| locale | INTERNAL |
| roles[] | INTERNAL (authorization metadata) |
| last_sign_in_at, banned_until | INTERNAL |

## 3. Handling Rules (Non-Runtime)

- **Exports:** any export containing `PII-SENSITIVE` or `PHI` must go through `src/lib/exportGuard.ts` and be audited.
- **Logs / telemetry:** classified fields MUST NOT be logged. Correlation IDs from `src/lib/observability/correlationId.ts` are the safe substitute.
- **Screenshots / attachments in tickets:** redaction required for PHI + PII-SENSITIVE.
- **Downstream contracts:** every new contract field must carry `x-classification`.

## 4. Deferred Migration — DB `COMMENT` Metadata

To make classification machine-readable in the database, a future migration
will add `COMMENT ON COLUMN` metadata using the format
`class=<tag>; owner=<domain>`. **Not applied in Sprint 3.**

Sketch (for governance review only — DO NOT RUN):

```sql
-- Sprint N (deferred): classification metadata via COMMENT.
-- COMMENT ON COLUMN public.patients.national_id IS 'class=PII-SENSITIVE; owner=patients';
-- COMMENT ON COLUMN public.patients.date_of_birth IS 'class=PHI; owner=patients';
-- ... one row per classified column across the 5 aggregates ...
```

Rationale for deferral: `COMMENT ON` is a schema-touching migration and
Sprint 3 forbids schema changes. The Markdown registry above is the
authoritative source until the migration is approved.
