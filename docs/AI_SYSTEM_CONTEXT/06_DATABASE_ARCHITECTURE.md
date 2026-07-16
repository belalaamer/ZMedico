# 06 — Database Architecture

## Conventions
- Schema: `public` for app data. Never touch `auth`, `storage`, `realtime`, `vault`, `supabase_functions`.
- Every new table: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → policies (see `docs/AUTHORIZATION_STANDARDS.md`).
- Primary keys: `uuid default gen_random_uuid()`.
- Timestamps: `created_at`, `updated_at` (timestamptz).
- Soft-delete when required uses `deleted_at`.
- Counters (invoice, PO, SKU, employee id, SaaS invoice): dedicated `*_counter` tables locked via SECURITY DEFINER RPC (Pattern P11).

## Grouping
See `14_DATABASE_CATALOG.md` for the full table list (~110 tables). Groups:

| Group | Tables |
|---|---|
| Identity & Authz | `profiles`, `user_roles`, `role_permissions`, `authz_*`, `allowed_signup_emails` |
| Clinical | `patients`, `patient_documents`, `medical_records`, `record_*`, `vital_signs`, `dental_chart`, `prescriptions`, `prescription_items`, `medications`, `diagnoses`, `procedures`, `treatment_plans`, `treatment_sessions`, `medical_specialties`, `medical_history` |
| Physio | `physio_cases`, `physio_sessions`, `physio_reassessments` |
| Scheduling | `appointments`, `appointment_settings`, `queue_*` |
| Revenue | `invoices`, `invoice_items`, `invoice_counters`, `invoice_settings`, `payments`, `payment_methods`, `expenses`, `expense_categories`, `treasury*`, `patient_wallet*`, `coupons`, `coupon_redemptions`, `insurance_*`, `loyalty_settings` |
| Inventory | `products`, `product_categories`, `product_sku_counter`, `inventory`, `inventory_transactions`, `stock_alerts`, `services`, `service_categories`, `service_consumables`, `suppliers`, `purchase_orders`, `purchase_order_items`, `po_counters` |
| HR | `staff_profiles`, `staff_positions`, `staff_branches`, `departments`, `employee_id_counter`, `leave_requests`, `leave_types`, `payroll`, `salary_adjustments`, `doctor_commissions`, `staff_targets`, `performance_reviews`, `attendance`, `work_schedules` |
| Comms | `communication_templates`, `email_templates`, `sms_templates`, `whatsapp_templates`, `reminders`, `notifications`, `notification_settings` |
| Reports & Audit | `saved_reports`, `report_templates`, `report_schedules`, `audit_export_presets`, `audit_logs`, `user_activity_logs` |
| Platform | `branches`, `tenants`, `clinic_profile`, `clinic_settings`, `system_languages`, `system_backups`, `subscriptions`, `subscription_plans`, `subscription_addons`, `tenant_addons`, `tenant_usage`, `saas_invoices`, `saas_payments`, `saas_invoice_counters` |

## RLS strategy
- Enforced on every public table.
- Common patterns: owner-scoped, role-scoped (`has_role(auth.uid(), 'admin')`), branch-scoped (via `staff_branches`), self-scoped (`user_id = auth.uid()`).
- Full analysis: `scripts/authz/analyze_rls.py`, `docs/AUTHORIZATION_INVENTORY.md`.

## Definer functions
Catalogued in `scripts/authz/rpc_manifest.yaml` and audited via `scripts/authz/compliance_definer.py`. Never edit without governance ticket.

## Migrations
- Location: `supabase/migrations/` (managed).
- Rollback SQL kept per hotfix under `docs/security/*_ROLLBACK.sql`, `docs/wave3*/`.
