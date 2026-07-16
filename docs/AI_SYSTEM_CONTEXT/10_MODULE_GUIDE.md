# 10 — Module Guide

Each module follows the same shape: purpose, features, pages, tables, permissions (group), business rules, extension points, limitations.

## Patients
- **Purpose**: single source of truth for patient master data + 360° profile.
- **Pages**: `/patients`, `/patients/:id`, `/patients/:id/dental`.
- **Tables**: `patients`, `patient_documents`, `patient_wallets`, `patient_wallet_transactions`, `medical_history`.
- **Permissions group**: `patients`, `patient_wallet`, `documents`.
- **Rules**: PHI; RLS restricts to authorized staff; wallet debits/credits are logged.
- **Extension**: patient portal (future), FHIR export (future).

## Appointments & Calendar & Queue
- **Pages**: `/calendar`, `/appointments/:appointmentId`, `/queue`, `/queue/audit`, `/queue/self-audit`.
- **Tables**: `appointments`, `appointment_settings`, `queue_settings`, `queue_alerts`, `queue_alert_runs`.
- **Edge functions**: `detect-queue-alerts`, `send-reminder`, `enqueue-winback`.
- **Rules**: status machine in `src/lib/appointmentStatus.ts`; queue alerts recorded for audit.

## Medical Records
- **Pages**: `/medical/records`, `/medical/records/:id`, `/medical/consultation/:recordId`, `/medical/quick-consult`, `/medical/prescriptions`, `/medical/documents`, `/medical/specialties`, `/medical/diagnoses`.
- **Tables**: `medical_records`, `record_diagnoses`, `record_procedures`, `vital_signs`, `dental_chart`, `prescriptions`, `prescription_items`, `medications`, `diagnoses`, `procedures`, `medical_specialties`, `treatment_plans`, `treatment_sessions`.
- **Rules**: PHI; consultation flow enforces vitals → diagnosis → prescription order in UI (soft rule).

## Physio
- **Pages**: `/physio`, `/physio/dashboard`, `/physio/reports`, `/physio/followups`, `/physio/:id`.
- **Tables**: `physio_cases`, `physio_sessions`, `physio_reassessments`.
- **Rules**: case-based; close/reassess permissions gated separately.

## Invoicing & Payments
- **Pages**: `/invoices`, `/invoices/outstanding`, `/invoices/:id`, `/payments`.
- **Tables**: `invoices`, `invoice_items`, `invoice_counters`, `invoice_settings`, `payments`, `payment_methods`.
- **Rules**: invoice numbers via counter RPC; refunds gated by `payments.refund`.
- **PDF**: `src/lib/invoicePdf.ts`.

## Treasury & Expenses
- **Pages**: `/treasury`, `/treasury/daily-close`, `/expenses`, `/expenses/self-audit`.
- **Tables**: `treasury`, `treasury_transactions`, `treasury_daily_closes`, `expenses`, `expense_categories`.
- **Rules**: daily close is immutable once posted (**Assumption** based on schema fields).

## Coupons, Wallet, Insurance, Loyalty
- **Tables**: `coupons`, `coupon_redemptions`, `patient_wallets`, `patient_wallet_transactions`, `insurance_companies`, `insurance_contracts`, `insurance_contract_rules`, `loyalty_settings`.
- **Rules**: coupon redemption is single-write; wallet transactions balance to `patient_wallets`.

## Inventory & Procurement
- **Pages**: `/inventory`, `/inventory/stock`, `/inventory/products`, `/inventory/categories`, `/inventory/suppliers`, `/inventory/purchase-orders`, `/inventory/alerts`.
- **Tables**: `products`, `product_categories`, `product_sku_counter`, `inventory`, `inventory_transactions`, `stock_alerts`, `services`, `service_categories`, `service_consumables`, `suppliers`, `purchase_orders`, `purchase_order_items`, `po_counters`.
- **Rules**: stock alerts derived from thresholds; PO status machine controls receive action.

## HR & Payroll & Attendance
- **Tables**: `staff_profiles`, `staff_positions`, `staff_branches`, `departments`, `employee_id_counter`, `leave_requests`, `leave_types`, `payroll`, `salary_adjustments`, `doctor_commissions`, `staff_targets`, `performance_reviews`, `attendance`, `work_schedules`.
- **Rules**: `staff_branches` maps staff to branches for branch-scoped RLS.

## Communications
- **Pages**: `/reminders`, `/reminders/scheduled`.
- **Tables**: `communication_templates`, `email_templates`, `sms_templates`, `whatsapp_templates`, `reminders`, `notifications`, `notification_settings`.
- **Edge functions**: `send-reminder`, `enqueue-winback`.

## Reports & Audit
- **Tables**: `saved_reports`, `report_templates`, `report_schedules`, `audit_logs`, `user_activity_logs`, `audit_export_presets`.
- **Rules**: exports gated by `<CanExport>` and `src/lib/exportGuard.ts`.

## Settings & Platform
- **Tables**: `clinic_profile`, `clinic_settings`, `branches`, `tenants`, `system_languages`, `system_backups`, `authz_*`, `role_permissions`, `user_roles`, `subscriptions`, `subscription_plans`, `subscription_addons`, `tenant_addons`, `tenant_usage`, `saas_invoices`, `saas_payments`, `saas_invoice_counters`.
