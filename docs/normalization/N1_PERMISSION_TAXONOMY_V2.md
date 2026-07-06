# N1 — Permission Taxonomy v2

**Status:** Design only. No `authz_permissions` rows written.

## 1. Naming Standard (formalized)

```
<group>.<verb>[.<qualifier>]
```

- `group`  — lowercase snake singular or short domain noun (`patients`, `physio`, `payroll`, `audit`).
- `verb`   — canonical set below. No synonyms (never `read`, `write`, `remove`, `send_email`).
- `qualifier` (optional) — used only when the verb alone is ambiguous within a group (`payments.refund`, `physio.close`, `prescriptions.dispense`).

### Canonical verbs (closed set)
| Verb | Meaning | Notes |
|---|---|---|
| `view` | Read one row / list | Never combined with export |
| `create` | Insert new row | |
| `edit` | Mutate existing row | |
| `delete` | Hard or soft delete | |
| `export` | Bulk read + download | Distinct from `view` for audit reasons |
| `approve` | Advance a workflow stage | Distinct from `edit` |
| `configure` | Change domain-level settings (not per-row) | Reserved for `_settings` domains |
| Custom | Only if no canonical verb fits, must be documented in taxonomy | e.g. `refund`, `dispense`, `run`, `close`, `reassess`, `receive`, `manage`, `credit`, `debit`, `log`, `compose`, `send` |

Forbidden shapes: uppercase, plural mismatch (`patient.view`), verb-first (`view.patients`), umbrella wildcards (`patients.*`).

## 2. Group Registry

Every RLS-protected table now maps to exactly one group. `group_key` in `authz_permissions` MUST equal the leftmost segment.

| Group | Purpose | Tables |
|---|---|---|
| `appointments` | Clinical scheduling | `appointments`, `appointment_settings` (via `configure`) |
| `patients` | Patient master | `patients`, `patient_wallets` (see `patient_wallet`), `patient_documents` (see `documents`) |
| `medical_records` | Clinical notes umbrella | `medical_records` |
| `dental` | Dental chart | `dental_chart` |
| `diagnoses` | Diagnosis coding | `diagnoses`, `record_diagnoses` |
| `procedures` | Procedure coding | `procedures`, `record_procedures` |
| `vitals` | Vitals capture | `vital_signs` |
| `prescriptions` | Rx & medications | `prescriptions`, `prescription_items`, `medications` |
| `treatment_plans` | Care plans | `treatment_plans`, `treatment_sessions` |
| `physio` | Physio cases | `physio_cases`, `physio_sessions`, `physio_reassessments` |
| `documents` | Patient documents | `patient_documents` |
| `invoices` | AR invoicing | `invoices`, `invoice_items`, `invoice_counters`*, `invoice_settings` |
| `payments` | Cash-in | `payments`, `payment_methods` |
| `expenses` | Cash-out | `expenses`, `expense_categories` |
| `treasury` | Bank/cash accounts | `treasury`, `treasury_transactions`, `treasury_daily_closes` |
| `patient_wallet` | Patient credit balance | `patient_wallets`, `patient_wallet_transactions` |
| `coupons` | Promotions | `coupons`, `coupon_redemptions` |
| `insurance` | Insurers & contracts | `insurance_companies`, `insurance_contracts`, `insurance_contract_rules` |
| `loyalty` | Loyalty program | `loyalty_settings` |
| `inventory` | Stock on hand | `inventory`, `inventory_transactions`, `stock_alerts` |
| `products` | SKU master | `products`, `product_categories`, `product_sku_counter`* |
| `purchase_orders` | Procurement | `purchase_orders`, `purchase_order_items`, `suppliers`, `po_counters`* |
| `services` | Services catalog | `services`, `service_categories`, `service_consumables` |
| `hr` | Employees | `staff_profiles`, `staff_positions`, `staff_branches`, `departments`, `employee_id_counter`* |
| `hr_leave` | Leave workflow | `leave_requests`, `leave_types` |
| `payroll` | Payroll | `payroll`, `salary_adjustments`, `doctor_commissions`, `staff_targets` |
| `performance` | Reviews | `performance_reviews` |
| `attendance` | Attendance & schedule | `attendance`, `work_schedules` |
| `queue` | Live queue | `queue_settings`, `queue_alerts`, `queue_alert_runs` |
| `communication` | Outbound messaging | `communication_templates`, `email_templates`, `sms_templates`, `whatsapp_templates`, `reminders` |
| `notifications` | User notifications | `notifications`, `notification_settings` |
| `reports` | Umbrella (deprecating) | — |
| `reports_finance` | Finance reports | — |
| `reports_hr` | HR reports | — |
| `reports_inventory` | Inventory reports | — |
| `reports_medical` | Medical reports | — |
| `reports_operational` | Operational reports | — |
| `audit` | Compliance | `audit_logs`, `user_activity_logs` |
| `settings` | Global system config | `clinic_profile`, `clinic_settings`, `branches`, `tenants`, `system_languages`, `medical_specialties`, `report_schedules`, `report_templates`, `allowed_signup_emails`, `system_backups`, `authz_*`, `role_permissions`, `user_roles`, `invoice_settings`, `notification_settings` (configure) |
| `saas_billing` | Platform billing | `saas_invoices`, `saas_payments`, `saas_invoice_counters`*, `subscriptions`, `subscription_plans`, `subscription_addons`, `tenants`, `tenant_addons`, `tenant_usage` |

`*` counter tables are infrastructure (Pattern P11) — no user-facing permission needed.

## 3. Complete Permission Registry v2

Legend: **[K]** = already in catalog. **[N]** = new. **[D]** = candidate for retirement (see N4).

### Clinical
- appointments.view [K], appointments.create [K], appointments.edit [K], appointments.delete [K], appointments.export [K], appointments.configure [N]
- patients.view [K], patients.create [K], patients.edit [K], patients.delete [K], patients.export [K]
- medical_records.view [K], .create [K], .edit [K], .delete [K], .export [K]
- dental.view [N], dental.edit [N]
- diagnoses.view [N], diagnoses.edit [N]
- procedures.view [N], procedures.edit [N]
- vitals.view [K], .create [K], .edit [K], .delete [K], .export [K]
- prescriptions.view [N], .create [N], .edit [N], .delete [N], .dispense [N]
- treatment_plans.view [K], .create [K], .edit [K], .delete [K], .export [K]
- physio.view [N], .create [N], .edit [N], .delete [N], .close [N], .reassess [N]
- documents.view [N], .upload [N], .delete [N]

### Finance
- invoices.view [K], .create [K], .edit [K], .delete [K], .export [K], .approve [N]
- payments.view [N], .create [N], .edit [N], .delete [N], .refund [N], .export [N]
- expenses.view [N], .create [N], .edit [N], .delete [N], .approve [N], .export [N]
- treasury.view [K], .create [K], .edit [K], .delete [K], .export [K]
- patient_wallet.view [N], .credit [N], .debit [N]
- coupons.view [K], .create [K], .edit [K], .delete [K], .export [K]
- insurance.view [N], .create [N], .edit [N], .delete [N]
- loyalty.view [N], .configure [N]

### Inventory & Procurement
- inventory.view [K], .create [K], .edit [K], .delete [K], .export [K]
- products.view [N], .create [N], .edit [N], .delete [N]
- purchase_orders.view [N], .create [N], .edit [N], .delete [N], .approve [N], .receive [N]
- services.view [N], .configure [N]

### HR / Operations
- hr.view [K], .create [K], .edit [K], .delete [K], .export [K]
- hr_leave.view [N], .request [N], .approve [N], .cancel [N]
- payroll.view [N], .run [N], .adjust [N], .export [N]
- performance.view [N], .create [N], .submit [N], .approve [N]
- attendance.view [N], .log [N], .edit [N]
- queue.view [N], .manage [N], .configure [N]

### Communication
- communication.view [N], .compose [N], .send [N], .configure [N]
- notifications.view [N], .configure [N]

### Reports (see N4 for umbrella deprecation)
- reports.view [K,D], reports.export [K,D]
- reports_finance.view [K], .export [K]
- reports_hr.view [K], .export [K]
- reports_inventory.view [K], .export [K]
- reports_medical.view [K], .export [K]
- reports_operational.view [K], .export [K]

### Governance
- settings.view [K], .create [K], .edit [K], .delete [K], .export [K]
- audit.read [N]
- saas_billing.view [N], .manage [N]

### Summary
- Existing keys retained: 67
- New keys proposed: 84
- Total v2 registry: **151 keys**
- Umbrella keys flagged for deprecation: 2 (`reports.view`, `reports.export`)
