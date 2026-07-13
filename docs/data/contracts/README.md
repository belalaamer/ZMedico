# Enterprise Data Contract Catalog (V13 Foundation)

**Sprint 3 — Documentation Only. Zero runtime, zero SQL, zero schema.**

This directory holds JSON Schema contracts for the five highest-value business
entities. Contracts are the canonical, human- and machine-readable definition
of each entity as it appears at the domain boundary (API responses, event
payloads, exports). They are **not yet enforced at runtime**. Enforcement is a
later sprint deliberately deferred to keep Sprint 3 fully reversible.

## Scope (Sprint 3)

Contracts are defined for exactly these aggregates:

| # | Entity      | Contract File             | Aggregate Root                                     |
|---|-------------|---------------------------|----------------------------------------------------|
| 1 | Patient     | `patient.schema.json`     | `public.patients`                                  |
| 2 | Appointment | `appointment.schema.json` | `public.appointments`                              |
| 3 | Invoice     | `invoice.schema.json`     | `public.invoices` (+ `invoice_items`)              |
| 4 | Payment     | `payment.schema.json`     | `public.payments`                                  |
| 5 | User        | `user.schema.json`        | `auth.users` + `public.profiles` + `public.user_roles` |

Every other table remains uncontracted for now. Expanding the catalog is a
governed activity per `docs/governance/CHARTER.md`.

## Contract Conventions

- **Spec version**: JSON Schema Draft 2020-12.
- **`$id`**: `https://zmedico.platform/schemas/<entity>/v1.json`. Version bump on any breaking change.
- **`x-classification`**: Per-field PHI/PII tag from `docs/data/classification/CLASSIFICATION_REGISTRY.md`.
- **`x-owner` / `x-steward` / `x-domain`**: Pulled from `docs/data/ownership/DATA_OWNERSHIP_MATRIX.md`.
- **`x-source`**: The source-of-truth table/column(s).
- **`x-quality-rules`**: References into `docs/data/quality/DATA_QUALITY_RULES.md`.
- **`x-retention`**: References into `docs/data/retention/RETENTION_SPECIFICATION.md`.

## Non-Goals (Sprint 3)

- No runtime validator wired into frontend or edge functions.
- No AJV/Zod code generation.
- No breaking changes to existing API shapes — contracts describe what already ships.
- No addition or removal of database columns.
- No package additions.

## Change Control

Any change to a contract requires the governance workflow defined in V6 and the
approval authority listed for the owning group in
`docs/governance/OWNERSHIP_MATRIX.md`.
