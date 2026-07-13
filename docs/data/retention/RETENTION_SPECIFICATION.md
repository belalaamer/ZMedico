# Retention Specification (V13 Foundation)

**Sprint 3 — Documentation Only.** No `pg_cron` jobs, no purge scripts, no
lifecycle triggers are added. This document is executable *by humans*: each
policy has a machine-friendly YAML block ready to feed a future scheduler.

## Policy Format

```yaml
id: RET-<AGG>-NN
aggregate: <CDM ID>
scope: <what the policy covers>
active_period: <soft-delete horizon>
archive_period: <cold-storage horizon>
purge_action: <soft_delete | hard_delete | anonymize | archive_then_purge>
legal_hold_override: <true|false>
regulatory_basis: <HIPAA / GDPR / SOX-adj / tax law>
review_cadence: annual
owner: <role from ownership matrix>
```

Retention **starts** on the aggregate's `deleted_at` unless otherwise stated.
Any record under legal hold is exempt.

---

## RET-PATIENT-01 — Patient Records

```yaml
id: RET-PATIENT-01
aggregate: CDM-PAT-001
scope: public.patients row + linked medical_history / medical_records
active_period: while patient is active (no deletion)
archive_period: 10 years after last clinical activity OR 25 years for pediatric records (until age 25)
purge_action: anonymize
legal_hold_override: true
regulatory_basis: HIPAA (6y minimum), typical medical retention (10y), pediatric extended
review_cadence: annual
owner: Head of Clinic Ops
notes: >
  Anonymization removes PII/PHI-SENSITIVE fields (national_id, phone, email,
  address, names) while preserving clinical statistics for research. Requires
  DPO sign-off per anonymization batch.
```

## RET-APPT-01 — Appointment Records

```yaml
id: RET-APPT-01
aggregate: CDM-APT-001
scope: public.appointments
active_period: 2 years online
archive_period: additional 5 years cold (total 7 years)
purge_action: hard_delete
legal_hold_override: true
regulatory_basis: HIPAA linked-record retention (bounded by patient retention)
review_cadence: annual
owner: Head of Clinic Ops
notes: Appointment history for retained patients is *not* purged; purge only when patient anonymized.
```

## RET-FIN-01 — Invoices and Payments

```yaml
id: RET-FIN-01
aggregate: CDM-INV-001, CDM-PAY-001
scope: public.invoices, invoice_items, payments, treasury_transactions
active_period: 7 years online (statutory tax + SOX-adjacent)
archive_period: +3 years cold (total 10 years)
purge_action: archive_then_purge
legal_hold_override: true
regulatory_basis: Tax law (typ. 7y), SOX-adjacent (7y), payer contract terms may extend
review_cadence: annual
owner: Head of Finance
notes: >
  Financial records are immutable within active_period. Voiding is modeled via
  status transitions, never row deletion. Purge requires Finance + DPO joint
  approval.
```

## RET-USER-01 — User Accounts

```yaml
id: RET-USER-01
aggregate: CDM-USR-001
scope: auth.users, public.profiles, public.user_roles, user_activity_logs
active_period: while employed / contracted
archive_period: 2 years after off-boarding (audit trail requirement)
purge_action: anonymize
legal_hold_override: true
regulatory_basis: GDPR minimization, labor-law audit trail
review_cadence: annual
owner: Head of Engineering (co-owner: DPO)
notes: >
  Role assignments and audit_logs referring to the user must remain
  attributable. Anonymization replaces email + full_name with a
  tombstone token; user_id remains as pseudonymous identifier.
```

## RET-AUDIT-01 — Audit Trail (informational)

```yaml
id: RET-AUDIT-01
aggregate: (audit_logs, user_activity_logs)
scope: append-only audit tables
active_period: 7 years online
archive_period: indefinite cold storage
purge_action: none  # audit trail is not purged
legal_hold_override: true
regulatory_basis: HIPAA, GDPR accountability, SOX
review_cadence: annual
owner: DPO
notes: Included for context; audit tables are not part of the five foundation aggregates.
```

---

## Legal Hold Registry (stub)

Retention policies MUST be paused when a legal hold is recorded. The registry
is not yet built. Sprint 3 documents the shape only:

```yaml
legal_hold:
  id: LH-YYYYMMDD-NNN
  scope: <aggregate + row identifiers or tenant-wide>
  starts_at: <timestamp>
  ends_at: null    # null = still active
  reason: <case / regulator inquiry>
  approved_by: <role>
```

## Deferred Implementation

Future implementation options (choose one when Sprint N schedules retention):

1. **`pg_cron` + `SECURITY DEFINER` purge functions** — server-side, cheapest.
2. **Edge Function on schedule** — auditable via HTTP logs.
3. **External orchestrator (Airflow / Temporal)** — heaviest, best when
   anonymization must fan out to backups.

Selection deferred to platform governance. Sprint 3 does not commit.
