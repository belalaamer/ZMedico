# Data Ownership Matrix (V13 Foundation)

**Sprint 3 — Documentation Only.** Complements
`docs/governance/OWNERSHIP_MATRIX.md` (which tracks *permission group*
ownership) with a **data aggregate** view. Each of the five Sprint 3
aggregates has a named Owner, Steward, and Domain.

| CDM ID       | Aggregate    | Business Owner (Accountable) | Data Steward (Responsible) | Business Domain | Regulatory | Escalation Path |
|--------------|--------------|------------------------------|----------------------------|-----------------|------------|------------------|
| CDM-PAT-001  | Patient      | Head of Clinic Ops           | Clinic Ops Data Steward    | Patient Care    | HIPAA / GDPR | Steward → Owner → DPO |
| CDM-APT-001  | Appointment  | Head of Clinic Ops           | Front-Desk Data Steward    | Patient Care    | HIPAA / GDPR | Steward → Owner → CMO |
| CDM-INV-001  | Invoice      | Head of Finance              | Finance Data Steward       | Revenue Cycle   | SOX-adj    | Steward → Owner → CFO |
| CDM-PAY-001  | Payment      | Head of Finance              | Finance Data Steward       | Revenue Cycle   | PCI-adj / SOX-adj | Steward → Owner → CFO + DPO |
| CDM-USR-001  | User         | Head of Engineering          | Identity Steward           | Identity        | GDPR       | Steward → Owner → DPO |

## Role Definitions

- **Business Owner (Accountable, RACI-A):** approves schema changes at the
  aggregate level, signs off on contract version bumps, arbitrates access
  disputes.
- **Data Steward (Responsible, RACI-R):** curates field definitions, enforces
  quality rules, triages data-quality incidents, coordinates retention.
- **Business Domain:** the value stream the aggregate serves. Aligns with the
  Business Ops Catalog (`docs/BUSINESS_OPERATIONS_CATALOG.md`).
- **Escalation Path:** ordered chain for approving exceptions.

## Rules

1. **Every CDM entry MUST have a named human role** in Owner and Steward columns. "TBD" is not allowed for the five foundation aggregates.
2. **Changes to the matrix** follow the governance workflow in V6.
3. **Consistency:** where a data aggregate overlaps a permission group in
   `docs/governance/OWNERSHIP_MATRIX.md`, the Business Owner MUST match.
4. **Handover:** owner departures require a 30-day overlap and written transfer memo.

## Deferred Ownership Assignments

The aggregates listed as deferred in `CANONICAL_DATA_MODEL.md` do not appear
here. They will be added when they enter the CDM.
