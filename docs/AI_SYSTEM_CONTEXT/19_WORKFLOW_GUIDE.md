# 19 — Workflow Guide

Step-by-step operator workflows. All checks pass through `AuthorizationService`.

## Patient Registration
1. Receptionist opens `/patients`, clicks "New".
2. Form validated client-side; `patients.create` required.
3. `insert` into `patients`; RLS enforces branch/tenant scope.
4. Optional: initialize `patient_wallets` row (balance 0).
5. Audit row written.

## Appointment Booking
1. `/calendar` → pick slot.
2. `appointments.create` required.
3. Insert row; realtime broadcast to queue subscribers.
4. `send-reminder` scheduled per `appointment_settings`.

## Queue Flow
1. Patient arrives → status `checked_in`.
2. Nurse takes vitals → `vital_signs` row.
3. Doctor calls next → status `in_consultation`.
4. Consultation closed → status `completed`.
5. `detect-queue-alerts` cron watches wait thresholds.

## Clinical Visit
1. `/medical/consultation/:recordId`.
2. Vitals → diagnosis → procedures → prescription.
3. Optional treatment plan.
4. Auto-generate draft invoice from record procedures + service prices.

## Invoice Creation
1. From consultation or manual: `invoices.create`.
2. Counter RPC allocates invoice number.
3. Line items validated against `services`/`products`.
4. Totals computed with `invoice_settings` (tax, rounding).

## Payment
1. `/invoices/:id` → "Take payment".
2. `payments.create`; method from `payment_methods`.
3. Treasury transaction mirrored.
4. Wallet method → `patient_wallet_transactions` debit.

## Refund
1. `/payments` → row action "Refund" (requires `payments.refund`).
2. Negative payment inserted; treasury adjusted; audit written.

## Inventory Deduction
1. On procedure completion, `service_consumables` map used.
2. `inventory_transactions` row per consumable.
3. Recompute on-hand; `stock_alerts` if below threshold.

## Attendance
1. Staff opens app → `GpsCheckDialog`.
2. Insert `attendance` row with GPS.
3. Payroll uses `attendance` + `work_schedules`.

## HR: Leave
1. Staff submits `leave_requests` (`hr_leave.request`).
2. Manager approves (`hr_leave.approve`).
3. Payroll deducts per leave type.

## Marketing / Reminders
1. `enqueue-winback` cron scans lapsed patients.
2. Inserts `reminders`.
3. `send-reminder` cron dispatches via chosen channel.

## Authentication
1. `/auth` → email+password or Google OAuth.
2. `AuthContext` hydrates session.
3. `useUserRole` reads `user_roles`.
4. `useAuthorization` initializes `AuthorizationService`.

## Authorization decision
See sequence diagram in `07_AUTHORIZATION_ARCHITECTURE.md`.
