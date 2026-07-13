# Canonical Data Model Registry (V13 Foundation)

**Sprint 3 — Documentation Only. No schema change, no migration, no runtime dependency.**

The Canonical Data Model (CDM) is the authoritative catalogue of business
aggregates that the platform recognizes as first-class. It is deliberately
**smaller** than the physical schema: not every table is an aggregate, and not
every aggregate is a table.

## Register (Sprint 3 Foundation)

| CDM ID       | Aggregate    | Root Table            | Contract                                    | Owning Domain | Classification |
|--------------|--------------|-----------------------|---------------------------------------------|---------------|----------------|
| CDM-PAT-001  | Patient      | `public.patients`     | `docs/data/contracts/patient.schema.json`   | patients      | PHI            |
| CDM-APT-001  | Appointment  | `public.appointments` | `docs/data/contracts/appointment.schema.json` | appointments | PHI            |
| CDM-INV-001  | Invoice      | `public.invoices`     | `docs/data/contracts/invoice.schema.json`   | invoices      | Financial      |
| CDM-PAY-001  | Payment      | `public.payments`     | `docs/data/contracts/payment.schema.json`   | payments      | Financial      |
| CDM-USR-001  | User         | `auth.users` + `public.profiles` + `public.user_roles` | `docs/data/contracts/user.schema.json` | identity | PII |

## Deferred Aggregates (Explicitly Out of Sprint 3)

The following aggregates are important but intentionally not registered yet.
Each will require its own governance ticket to promote into the CDM.

- Medical Record / Prescription / Diagnosis (clinical) — pending CMO sign-off.
- Treatment Plan / Session — depends on physio module stabilization.
- Inventory / Purchase Order — pending Ops steward assignment.
- Payroll / Leave — dual-owned (People + Finance); needs quorum.
- Tenant / Subscription (SaaS billing) — pending platform PM.

## Rules

1. **Contract required.** No aggregate enters the CDM without a JSON Schema contract in `docs/data/contracts/`.
2. **Owner + Steward required.** Both must appear in `docs/data/ownership/DATA_OWNERSHIP_MATRIX.md` before promotion.
3. **Classification required.** All fields must map to `docs/data/classification/CLASSIFICATION_REGISTRY.md`.
4. **Backward compatible.** Adding to the CDM is a documentation act; removing or renaming an aggregate follows the deprecation policy in `docs/governance/LIFECYCLE_POLICY.md`.
5. **No runtime coupling in Sprint 3.** The registry is a source document; enforcement engines are a future sprint.
