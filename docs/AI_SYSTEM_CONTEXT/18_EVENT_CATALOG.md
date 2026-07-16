# 18 — Event Catalog

| Event (logical) | Trigger source | Effects |
|---|---|---|
| Invoice issued | insert on `invoices` | counter bump; audit log |
| Payment recorded | insert on `payments` | treasury_transaction row; wallet update if wallet method |
| Wallet debit/credit | insert on `patient_wallet_transactions` | recompute `patient_wallets.balance` |
| Appointment status change | update on `appointments` | realtime broadcast; queue recalculation |
| Queue threshold breach | cron → `detect-queue-alerts` | insert `queue_alerts` + `queue_alert_runs` |
| Reminder due | cron → `send-reminder` | outbound message; `reminders.status` update |
| Winback candidate identified | cron → `enqueue-winback` | insert `reminders` |
| Stock below threshold | insert/update on `inventory` | insert `stock_alerts` |
| User created | Edge fn `admin-create-user` | `auth.users` + `profiles` + `user_roles` |
| Audit action | any mutation | insert `audit_logs` / `user_activity_logs` |
