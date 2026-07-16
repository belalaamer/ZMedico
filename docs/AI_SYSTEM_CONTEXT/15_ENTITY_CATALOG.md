# 15 — Entity Catalog (Aggregates)

See `04_DOMAIN_MODEL.md` for the full aggregate map. Highlights:

## Patient
- **Root**: `patients`.
- **Children**: `patient_documents`, `patient_wallets`, `patient_wallet_transactions`, `medical_history`.
- **Invariants**: PHI; RLS-scoped; wallet balance = Σ(wallet_transactions).
- **Contract**: `docs/data/contracts/patient.schema.json`.

## Appointment
- **Root**: `appointments`. Config: `appointment_settings`.
- **Invariants**: status transitions gated in `src/lib/appointmentStatus.ts`.
- **Contract**: `docs/data/contracts/appointment.schema.json`.

## Invoice
- **Root**: `invoices` + `invoice_items`.
- **Invariants**: `number` monotonic per counter; total = Σ(items) − discounts + tax.
- **Contract**: `docs/data/contracts/invoice.schema.json`.

## Payment
- **Root**: `payments`.
- **Invariants**: refunds require `payments.refund`; treasury movement mirrored.
- **Contract**: `docs/data/contracts/payment.schema.json`.

## User
- **Root**: `auth.users` + `profiles` + `user_roles`.
- **Invariants**: roles live only in `user_roles`; checked via `has_role()`.
- **Contract**: `docs/data/contracts/user.schema.json`.
