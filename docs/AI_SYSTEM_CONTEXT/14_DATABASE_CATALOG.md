# 14 — Database Catalog

Complete public-schema table list (see `<supabase-tables>` context for column counts). Each entry: purpose + module.

| Table | Module | Purpose |
|---|---|---|
| allowed_signup_emails | Identity | Whitelist of emails permitted to sign up. |
| appointment_settings | Scheduling | Per-clinic scheduling config. |
| appointments | Scheduling | Booked appointments. |
| attendance | HR | Staff check-in/out records. |
| audit_export_presets | Reports | Reusable export configurations. |
| audit_logs | Audit | System audit trail. |
| authz_bundle_implies | Authz | Bundle implication graph. |
| authz_bundle_permissions | Authz | Permissions per bundle. |
| authz_bundles | Authz | Named permission bundles. |
| authz_permissions | Authz | Permission catalog. |
| authz_role_bundles | Authz | Bundles assigned to roles. |
| authz_shadow_decisions | Authz | Shadow probe outcomes. |
| authz_shadow_expected_expansions | Authz | Expected canonical expansions. |
| authz_shadow_slice_gate | Authz | Shadow slice gating. |
| authz_versions | Authz | Authorization version registry. |
| branches | Platform | Physical clinic locations. |
| clinic_profile | Platform | Clinic branding/legal info. |
| clinic_settings | Platform | Clinic-wide feature settings. |
| communication_templates | Comms | Multi-channel template registry. |
| coupon_redemptions | Revenue | Coupon usage log. |
| coupons | Revenue | Discount coupons. |
| dental_chart | Clinical | Tooth-level dental data. |
| departments | HR | Organizational units. |
| diagnoses | Clinical | Diagnosis catalog (ICD-like). |
| doctor_commissions | HR/Payroll | Commission rules per doctor. |
| email_templates | Comms | Email template registry. |
| employee_id_counter | HR | Employee number counter. |
| expense_categories | Finance | Expense taxonomy. |
| expenses | Finance | Recorded expenses. |
| insurance_companies | Insurance | Payer registry. |
| insurance_contract_rules | Insurance | Per-service payout rules. |
| insurance_contracts | Insurance | Payer contracts. |
| inventory | Inventory | Stock on hand. |
| inventory_transactions | Inventory | Stock movements. |
| invoice_counters | Revenue | Invoice number sequences. |
| invoice_items | Revenue | Line items. |
| invoice_settings | Revenue | Invoice defaults (VAT, terms). |
| invoices | Revenue | Patient invoices. |
| leave_requests | HR | Staff leave workflow. |
| leave_types | HR | Leave taxonomy. |
| loyalty_settings | Revenue | Loyalty program config. |
| medical_history | Clinical | Longitudinal patient history. |
| medical_records | Clinical | Encounter notes. |
| medical_specialties | Clinical | Specialty registry. |
| medications | Clinical | Medication catalog. |
| notification_settings | Comms | User notification prefs. |
| notifications | Comms | In-app notifications. |
| patient_documents | Clinical | Uploaded documents. |
| patient_wallet_transactions | Revenue | Wallet ledger. |
| patient_wallets | Revenue | Patient credit balances. |
| patients | Clinical | Patient master. |
| payment_methods | Revenue | Method catalog. |
| payments | Revenue | Payment records. |
| payroll | HR | Payroll runs. |
| performance_reviews | HR | Staff reviews. |
| physio_cases | Physio | Rehab cases. |
| physio_reassessments | Physio | Progress reassessments. |
| physio_sessions | Physio | Rehab sessions. |
| po_counters | Inventory | PO number sequences. |
| prescription_items | Clinical | Rx line items. |
| prescriptions | Clinical | Prescriptions. |
| procedures | Clinical | Procedure catalog (CPT-like). |
| product_categories | Inventory | Product taxonomy. |
| product_sku_counter | Inventory | SKU sequence. |
| products | Inventory | Product master. |
| profiles | Identity | Non-sensitive user profile. |
| purchase_order_items | Inventory | PO lines. |
| purchase_orders | Inventory | POs. |
| queue_alert_runs | Queue | Alert run history. |
| queue_alerts | Queue | Emitted alerts. |
| queue_settings | Queue | Queue thresholds. |
| record_diagnoses | Clinical | Diagnosis attached to record. |
| record_procedures | Clinical | Procedure attached to record. |
| reminders | Comms | Reminder queue. |
| report_schedules | Reports | Scheduled reports. |
| report_templates | Reports | Report definitions. |
| role_permissions | Authz (legacy) | Legacy grant map. |
| saas_invoice_counters | SaaS | SaaS invoice sequence. |
| saas_invoices | SaaS | Platform invoices. |
| saas_payments | SaaS | Platform payments. |
| salary_adjustments | HR | Payroll adjustments. |
| saved_reports | Reports | Persisted report snapshots. |
| service_categories | Services | Service taxonomy. |
| service_consumables | Services | Consumables per service. |
| services | Services | Service catalog. |
| sms_templates | Comms | SMS template registry. |
| staff_branches | HR | Staff↔branch mapping (RLS scoping). |
| staff_positions | HR | Position catalog. |
| staff_profiles | HR | Staff profile detail. |
| staff_targets | HR | KPI targets. |
| stock_alerts | Inventory | Low-stock alerts. |
| subscription_addons | SaaS | Plan add-ons. |
| subscription_plans | SaaS | SaaS plans. |
| subscriptions | SaaS | Tenant subscriptions. |
| suppliers | Inventory | Supplier registry. |
| system_backups | Platform | Backup runs. |
| system_languages | Platform | i18n language registry. |
| tenant_addons | SaaS | Tenant add-on assignments. |
| tenant_usage | SaaS | Usage metering. |
| tenants | Platform | Logical tenants. |
| treasury | Finance | Cash/bank accounts. |
| treasury_daily_closes | Finance | Daily reconciliations. |
| treasury_transactions | Finance | Account movements. |
| treatment_plans | Clinical | Care plans. |
| treatment_sessions | Clinical | Plan sessions. |
| user_activity_logs | Audit | User activity trail. |
| user_roles | Authz | User↔role assignments (source of truth). |
| vital_signs | Clinical | Vitals captured per encounter. |
| whatsapp_templates | Comms | WhatsApp template registry. |
| work_schedules | HR | Staff schedules. |

For column details, indexes, triggers, and policies use `supabase--read_query` on `information_schema` and `pg_catalog`, or read `docs/AUTHORIZATION_INVENTORY.md`.
