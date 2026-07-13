# Data Quality Rules (V13 Foundation)

**Sprint 3 — Documentation Only.** These rules define **what "correct" means**
for the five canonical aggregates. No runtime validation engine is introduced.
Enforcement will be added incrementally in a later sprint, either via CHECK
constraints, triggers, or a validator sidecar — that decision is deferred.

## Rule Format

Each rule has: `ID`, `Aggregate`, `Field(s)`, `Rule`, `Dimension`, `Severity`, `Enforcement Today`, `Planned Enforcement`.

**Dimensions** (DAMA-DMBOK): Accuracy, Completeness, Consistency, Uniqueness, Validity, Timeliness, Integrity.

**Severity**: `CRITICAL` (blocks release), `HIGH` (must fix same-day), `MEDIUM` (fix within sprint), `LOW` (backlog).

## Patient (CDM-PAT-001)

| ID | Field(s) | Rule | Dimension | Severity | Today | Planned |
|----|----------|------|-----------|----------|-------|---------|
| DQ-PAT-01 | `patient_code` | Unique per tenant; non-empty; matches `^[A-Z0-9-]{3,32}$` | Uniqueness / Validity | HIGH | App-generated | DB CHECK + partial UNIQUE |
| DQ-PAT-02 | `first_name_en`, `last_name_en` | Non-empty; trimmed; length 1–64 | Completeness | HIGH | Form validation | Contract validator |
| DQ-PAT-03 | `date_of_birth` | `<= now()` and `>= 1900-01-01` when present | Validity | MEDIUM | None | DB CHECK |
| DQ-PAT-04 | `national_id` | Format per tenant country; unique per tenant when present | Uniqueness / Validity | HIGH | None | Validator + partial UNIQUE |
| DQ-PAT-05 | `phone` | E.164 when present | Validity | MEDIUM | Loose | Validator |

## Appointment (CDM-APT-001)

| ID | Field(s) | Rule | Dimension | Severity | Today | Planned |
|----|----------|------|-----------|----------|-------|---------|
| DQ-APT-01 | `start_at` | Required; not more than 5 years in future | Validity | HIGH | Form validation | DB CHECK |
| DQ-APT-02 | `end_at` | If present, `end_at > start_at` | Consistency | HIGH | Form validation | DB CHECK |
| DQ-APT-03 | `status` transitions | Follow `src/lib/appointmentStatus.ts` state machine | Consistency | HIGH | Enforced in helper | Trigger (deferred) |
| DQ-APT-04 | `checked_in_at`, `started_at` | Set/cleared per `buildStatusPatch` rules | Integrity | MEDIUM | App | Trigger |

## Invoice (CDM-INV-001)

| ID | Field(s) | Rule | Dimension | Severity | Today | Planned |
|----|----------|------|-----------|----------|-------|---------|
| DQ-INV-01 | `invoice_number` | Unique per tenant; monotonic per counter | Uniqueness | CRITICAL | `invoice_counters` | Already enforced |
| DQ-INV-02 | `total` | `total = subtotal - discount + tax` (rounded to 2dp) | Accuracy | CRITICAL | App | DB trigger (deferred) |
| DQ-INV-03 | `amount_paid` | `0 <= amount_paid <= total`; drives `status` transition | Consistency | CRITICAL | Payment trigger | Already enforced server-side |
| DQ-INV-04 | items[].line_total | `line_total = quantity * unit_price` | Accuracy | HIGH | App | Trigger (deferred) |
| DQ-INV-05 | `status = paid` | Requires `amount_paid = total` | Consistency | HIGH | Trigger | Enforced |

## Payment (CDM-PAY-001)

| ID | Field(s) | Rule | Dimension | Severity | Today | Planned |
|----|----------|------|-----------|----------|-------|---------|
| DQ-PAY-01 | `amount` | `> 0` (refunds modeled as negative-adjacent entities, not payments) | Validity | CRITICAL | App | DB CHECK |
| DQ-PAY-02 | `invoice_id` | If present, invoice belongs to same tenant + patient | Integrity | CRITICAL | FK + trigger | Enforced |
| DQ-PAY-03 | `payment_method` | Enum value only | Validity | HIGH | App | DB CHECK (deferred) |
| DQ-PAY-04 | `deleted_at` | Setting triggers treasury reversal + invoice recalc | Integrity | CRITICAL | Trigger | Already enforced |

## User (CDM-USR-001)

| ID | Field(s) | Rule | Dimension | Severity | Today | Planned |
|----|----------|------|-----------|----------|-------|---------|
| DQ-USR-01 | `roles[]` | Roles stored in `public.user_roles` only — never on profile | Integrity | CRITICAL | Enforced (V8) | Enforced |
| DQ-USR-02 | `email` | RFC 5322 valid; unique in `auth.users` | Uniqueness | CRITICAL | Supabase Auth | Enforced |
| DQ-USR-03 | `roles[]` | At least one active role for non-banned users | Completeness | MEDIUM | None | Validator / cron report |

## Cross-Aggregate Rules

| ID | Rule | Severity |
|----|------|----------|
| DQ-X-01 | Every `payment.patient_id` matches `invoice.patient_id` when `invoice_id` set. | CRITICAL |
| DQ-X-02 | Every `appointment.patient_id` references an existing (non-deleted) patient. | HIGH |
| DQ-X-03 | Soft-deleted patients cannot receive new appointments, invoices, or payments. | HIGH |

## Non-Goals (Sprint 3)

- No AJV / Zod runtime validator.
- No CI job that scans database rows against these rules.
- No dashboard.
- No CHECK constraint added yet.
