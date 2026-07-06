# Authorization Normalization Report

**Phase:** Authorization Normalization (pause between Wave 3E Batch A and Wave 3F).
**Status:** Documentation only. No SQL, no permission, no bundle, no role, no RLS, no frontend changes.

**Sources cross-referenced**
- Live database: `authz_permissions`, `authz_bundles`, `authz_bundle_permissions`, `authz_role_bundles`, `authz_bundle_implies`, `user_roles`, `app_role` enum
- Live `pg_policies` (RLS bodies scanned for `has_role()` / `has_permission()`)
- Frontend source scan (`src/**`) for permission-key literals
- Business-operation inventory derived from `supabase-tables` context (100+ tables)

---

## 1. Snapshot

| Object | Count |
|---|---|
| Permission keys in catalog | 67 |
| Bundles | 8 (all `bundle.role.<role>` legacy shape) |
| Bundle → permission edges | 141 |
| Role → bundle edges | 7 (nurse missing) |
| `app_role` enum values | 8 (`admin, manager, accountant, doctor, hr, nurse, receptionist, staff`) |
| Roles used in `user_roles` | 8 (all enum values) |
| Distinct permission keys referenced by RLS | **7** |
| Distinct roles referenced by RLS `has_role()` | 8 (all) |
| `has_role()` occurrences in RLS | **510** |
| `has_permission()` occurrences in RLS | 66 |
| Frontend permission-literal occurrences | ~15 distinct keys |

---

## 2. Missing Permission Families (§1)

Business domains that have RLS-protected tables **but no permission key in the catalog**. Each is a hard blocker for the P4/P5/P8 migration waves.

| Domain | Representative tables | Consequence |
|---|---|---|
| **Finance – expenses** | `expenses`, `expense_categories` | Wave 3E deferred `manager_expenses_*` policies |
| **Finance – payments** | `payments`, `payment_methods` | Wave 3E deferred `manager_payments_*` policies |
| **Physio** | `physio_cases`, `physio_sessions`, `physio_reassessments` | Wave 3H (Stateful) cannot start |
| **Prescriptions** | `prescriptions`, `prescription_items`, `medications` | Clinical write path unclassifiable |
| **Queue** | `queue_settings`, `queue_alerts`, `queue_alert_runs` | Wave 3F P5 blocked |
| **Insurance** | `insurance_companies`, `insurance_contracts`, `insurance_contract_rules` | Billing dependency |
| **Purchase orders** | `purchase_orders`, `purchase_order_items`, `suppliers` | Wave 3H P8 blocked |
| **Leave / payroll / performance** | `leave_requests`, `leave_types`, `payroll`, `salary_adjustments`, `performance_reviews` | Wave 3H P9 blocked |
| **Communication** | `communication_templates`, `email_templates`, `sms_templates`, `whatsapp_templates`, `reminders`, `notifications`, `notification_settings` | Cannot express "compose vs send" separation |
| **Loyalty / wallet** | `loyalty_settings`, `patient_wallets`, `patient_wallet_transactions` | Finance-adjacent, no key |
| **Attendance / scheduling** | `attendance`, `work_schedules` | HR-adjacent, no key |
| **Documents** | `patient_documents` | Uses `medical_records.*`? No — currently `has_role()` only |
| **Dental / diagnoses / procedures** | `dental_chart`, `diagnoses`, `record_diagnoses`, `record_procedures`, `procedures` | Uses `medical_records.*`? Ambiguous |
| **Audit / compliance** | `audit_logs`, `user_activity_logs` | Only `settings.export` — no dedicated `audit.read` |
| **SaaS billing** | `saas_invoices`, `saas_payments`, `saas_invoice_counters`, `subscriptions`, `subscription_plans`, `subscription_addons`, `tenants`, `tenant_addons`, `tenant_usage` | Platform-tier ops with no keys |
| **Products / SKU** | `products`, `product_categories`, `product_sku_counter`, `stock_alerts`, `inventory_transactions` | Partial coverage via `inventory.*` |

**Total missing families: 16.**

---

## 3. Duplicate Permissions (§2)

No duplicate `key` values (unique index enforces). However:

- `reports.view` / `reports.export` overlap conceptually with `reports_finance.*`, `reports_hr.*`, `reports_inventory.*`, `reports_medical.*`, `reports_operational.*`. Effect: bundles grant both the umbrella and the specific keys (e.g., `bundle.role.admin` grants `reports.view` + all `reports_*.view`). This is **semantic duplication** — one key set is redundant.

**Recommendation:** deprecate the umbrella `reports.view` / `reports.export` in favor of the specific families, or vice-versa. Do not do both.

---

## 4. Unused Permissions (§3)

Permissions defined in the catalog that are referenced by **no RLS policy** *and* no frontend literal.

Referenced by RLS: `appointments.create/edit`, `patients.create/edit`, `settings.create/delete/edit/export` (7 keys).
Referenced by frontend (source scan): `appointments.view/edit`, `coupons.view`, `hr.view/export`, `inventory.view`, `invoices.view/create/delete`, `medical_records.view`, `patients.view/create/delete`, `reports.view`, `reports_finance.export`, `settings.view/edit`, `treasury.view`.

Union of referenced keys ≈ 20. Catalog has 67. **≈ 47 permission keys are currently unused anywhere.**

Notable dead keys (present in bundles, unused by RLS and frontend):
- `appointments.delete`, `appointments.export`
- `coupons.create`, `coupons.edit`, `coupons.delete`, `coupons.export`
- `hr.create`, `hr.edit`, `hr.delete`
- `inventory.create`, `inventory.edit`, `inventory.delete`, `inventory.export`
- `invoices.edit`, `invoices.export`
- `medical_records.create`, `medical_records.edit`, `medical_records.delete`, `medical_records.export`
- `patients.edit` (used in RLS), `patients.export`
- `reports_hr.*`, `reports_inventory.*`, `reports_medical.*`, `reports_operational.*` (partial)
- `settings.view`, `settings.create` (frontend uses `.view`; RLS uses `.create` on 2 tables)
- `treasury.create`, `treasury.edit`, `treasury.delete`, `treasury.export`
- `treatment_plans.*` (all 5 verbs unused by RLS/frontend)
- `vitals.*` (all 5 verbs unused by RLS/frontend)

These are not necessarily *wrong* — they are targets for the remaining migration waves. They become *problems* only if the corresponding RLS never migrates to them.

---

## 5. Unused Bundles (§4)

| Bundle | Assigned roles | Status |
|---|---|---|
| `bundle.role.admin` | admin | Used |
| `bundle.role.manager` | manager | Used |
| `bundle.role.accountant` | accountant | Used |
| `bundle.role.doctor` | doctor | Used |
| `bundle.role.hr` | hr | Used |
| `bundle.role.receptionist` | receptionist | Used |
| `bundle.role.staff` | staff | Used |
| `bundle.role.nurse` | **(none)** | **BROKEN** — no `authz_role_bundles` row binds the nurse role to this bundle, yet the nurse role is active in `user_roles` and referenced 28 times in RLS |

`authz_bundle_implies` is empty (no bundle-composition graph in use).

---

## 6. RLS Expecting Permissions Not Granted (§5)

For every `(policy, permission_key)` in RLS, check whether the role that adjacent policies still allow via `has_role()` actually holds that key. Findings from Wave 3E pre-flight:

| Policy (deferred) | Requires key | Role that RLS currently allows via has_role | Holds key? |
|---|---|---|---|
| `invoices.manager_invoices_insert` | `invoices.create` | manager | **NO** |
| `invoices.manager_invoices_update` | `invoices.edit` | manager | **NO** |
| `treasury.manager_treasury_select` | `treasury.view` | manager | YES (but accountant/admin also hold → SELECT expansion) |
| `expenses.manager_expenses_*` | *(no key)* | manager | N/A |
| `payments.manager_payments_*` | *(no key)* | manager | N/A |

**Also** — nurse role has permissions defined in `bundle.role.nurse` but the bundle is not bound. Every RLS policy currently gating on `has_role('nurse')` will pass; every future policy migrated to `has_permission()` will FAIL for nurse until the role-bundle link is restored.

---

## 7. Bundles Granting Permissions Unused by RLS (§6)

All 141 bundle→permission edges except the following are "dormant" (grant a permission that no RLS policy consumes yet):

Actively consumed edges (bundle grants a key that appears in RLS):
- admin, manager, receptionist → `appointments.create`, `appointments.edit`, `patients.create`, `patients.edit` (Wave 3E migrated)
- admin → `settings.create`, `settings.delete`, `settings.edit`, `settings.export` (Waves 3, 3A)
- doctor → `appointments.create`, `appointments.edit`
- nurse → `appointments.create`, `appointments.edit` *(but nurse bundle is unbound — see §5)*
- accountant → `settings.export` (via audit-adjacent SELECT policies)

Everything else is intentional forward stock for Waves 3F–3H but should be audited during those waves.

---

## 8. Business Operations Without Permissions (§7)

Cross-referencing frontend route/action inventory to permission catalog. Operations that exist in the app UI (based on `src/**` scan and table domains) but have **no gating permission key**:

- Record an expense / edit expense category
- Record a payment / refund a payment / configure payment methods
- Start / progress / close a physio case; log physio session; run reassessment
- Create prescription; dispense medication
- Manage queue (call next, skip, prioritize); manage queue alerts
- Add / edit insurance company; author insurance contract & rules
- Draft / receive / cancel purchase order; manage suppliers
- Request leave; approve leave; run payroll; write performance review; log salary adjustment
- Compose / send email/SMS/WhatsApp template; send reminder; toggle notification settings
- Adjust loyalty settings; credit/debit patient wallet
- Log attendance; edit work schedule
- Upload / view / delete patient document
- Edit dental chart cell; add diagnosis; add procedure to record
- View audit log; view user activity log (currently gated by `settings.export`, semantically wrong)
- Manage SaaS subscription; view tenant usage; manage tenant add-ons

**Total: ~30 distinct business operations with no dedicated permission key.**

---

## 9. Permissions Without Business Operation (§8)

Catalog keys that do not correspond to any operation currently exposed in the frontend:

- `treatment_plans.*` (all 5) — no UI page found in scan
- `vitals.*` (all 5) — no UI page found in scan (vitals capture happens inside `medical_records` UI which uses `medical_records.*`)
- `reports_hr.export`, `reports_inventory.export`, `reports_medical.export`, `reports_operational.export` — export UI absent for these families
- `appointments.export`, `patients.export`, `hr.export`, `invoices.export`, `inventory.export`, `treasury.export`, `medical_records.export`, `coupons.export`, `settings.export` — global "Export" affordance exists in only a subset of these

Some may be legitimate forward stock; each must be tagged **planned** or **retire**.

---

## 10. Recommended Catalog Additions (§9)

Add the following permission families to close every §2 gap. Verbs follow the established `.view/.create/.edit/.delete/.export` convention; add `.approve` where a workflow stage is inherent.

| Group key | Keys to add | Notes |
|---|---|---|
| `expenses` | view, create, edit, delete, export | Enables `manager_expenses_*` migration |
| `payments` | view, create, edit, delete, refund, export | `refund` is a distinct verb — high-risk |
| `physio` | view, create, edit, delete, close, reassess | `close` = stateful transition |
| `prescriptions` | view, create, edit, delete, dispense | `dispense` = one-way transition |
| `queue` | view, manage, configure | `manage` covers call-next/skip; `configure` for queue_settings |
| `insurance` | view, create, edit, delete | |
| `purchase_orders` | view, create, edit, delete, approve, receive | Approval chain |
| `hr_leave` | view, request, approve, cancel | Request vs approve = P9 |
| `payroll` | view, run, adjust, export | `run` is high-risk |
| `performance` | view, create, submit, approve | P9 |
| `communication` | view, compose, send, configure | Split compose vs send |
| `notifications` | view, configure | |
| `loyalty` | view, configure | |
| `patient_wallet` | view, credit, debit | High-risk |
| `attendance` | view, log, edit | |
| `documents` | view, upload, delete | patient_documents |
| `dental` | view, edit | dental_chart |
| `diagnoses` | view, edit | Or fold into medical_records |
| `procedures` | view, edit | Or fold into medical_records |
| `audit` | read | Replace misuse of `settings.export` on audit tables |
| `saas_billing` | view, manage | Platform tier only; do NOT grant to any tenant role |
| `products` | view, create, edit, delete | Separate from `inventory.*` if product-catalog editing is a distinct op |

Also add `.approve` variants where appropriate: `invoices.approve`, `expenses.approve`, `purchase_orders.approve`, `leave.approve`, `performance.approve`, `payroll.approve`.

---

## 11. Recommended Bundle Corrections (§10)

Ordered by severity.

1. **Bind `bundle.role.nurse` to the `nurse` role** (`INSERT INTO authz_role_bundles(role, bundle_key) VALUES ('nurse', 'bundle.role.nurse')`). Without this, every P5/P8 migration silently DENYs nurse.
2. **Manager bundle — resolve invoices/treasury write intent.** Either add `invoices.create`, `invoices.edit`, `treasury.edit` to `bundle.role.manager` (matching current RLS behavior), or accept that Wave 3E's finance policies must be re-scoped rather than substituted.
3. **Manager bundle — add all new finance keys** if intent is preserved: `expenses.view/create/edit`, `payments.view/create/edit`, `patient_wallet.view`.
4. **Accountant bundle — add** `expenses.view/create/edit`, `payments.view/create/edit/refund`, `payroll.view/run/adjust`, `insurance.*`, `purchase_orders.view/create/edit/receive`.
5. **Doctor bundle — add** `prescriptions.view/create/edit/dispense`, `physio.view/create/edit`, `dental.edit`, `diagnoses.edit`, `procedures.edit`, `documents.view/upload`, `patient_wallet.view`.
6. **Receptionist bundle — add** `queue.view/manage`, `documents.view/upload`, `communication.compose/send`, `notifications.view`.
7. **HR bundle — add** `hr_leave.*`, `payroll.view`, `performance.*`, `attendance.view/log/edit`.
8. **Staff bundle** currently grants only `appointments.view`; leave as-is or explicitly document as "minimum-access role".
9. **Deprecate umbrella `reports.view` / `reports.export`** in bundles once every consumer moves to the specific families, then delete the keys.
10. **Introduce a compliance/audit bundle** (`bundle.compliance`) with `audit.read` and bind it to whichever role plays compliance-officer (currently none — may require a new `app_role` enum value, but that is out of normalization scope).
11. **`bundle_implies` graph** is empty. Consider using it for composition, e.g. `bundle.role.admin` implies `bundle.role.manager` implies `bundle.role.staff`, to reduce the 141 explicit edges to ~40.

---

## 12. Recommended Migration Ordering After Normalization (§11)

Normalization must complete **before** Wave 3F. Suggested sub-waves:

- **N1 — Catalog additions.** Add every key from §10. No RLS change. Safe; strictly additive.
- **N2 — Bundle bindings.** Fix nurse bundle binding (§11 item 1). Add every new key to the appropriate bundle (§11 items 2–7). Verify Golden Baseline still 0-drift (bundles are consumed only where RLS uses `has_permission()`, so effect is limited to the 7 keys already migrated; no drift expected).
- **N3 — Retirement decisions.** For each key in §9, tag `planned` or `retire`. Delete `retire` keys.
- **N4 — Semantic dedup.** Choose between umbrella `reports.*` and family `reports_<domain>.*`; deprecate the losing side.
- **N5 — Compliance bundle & audit.read key.** Redirect `audit_logs` / `user_activity_logs` RLS from `settings.export` to `audit.read` (this is a small RLS change — treat as its own mini-wave with baseline diff).

**Then** resume the pattern-migration roadmap:

| After normalization | Wave | Pattern | Now unblocked because… |
|---|---|---|---|
| ✓ | 3E Batch B | P4 SELECT variants | still requires accountant/staff SELECT coverage decision — may still need per-policy analysis |
| ✓ | 3E Batch C | P4 finance | requires N1+N2 (expenses/payments keys, manager bundle correction) |
| ✓ | 3F | P5 Permission+Branch | requires N1 (queue/communication keys) |
| ✓ | 3F.2 | P10 Compliance | requires N5 (audit.read) |
| ✓ | 3G | P6/P7 Ownership | requires N1 (documents, wallet, physio) |
| ✓ | 3H | P8/P9 Stateful/Approval | requires N1 (approve verbs on purchase_orders, leave, performance, payroll, physio.close, prescriptions.dispense) |

---

## 13. Deliverables Checklist

- [x] §1 Missing permission families
- [x] §2 Duplicate permissions
- [x] §3 Unused permissions
- [x] §4 Unused bundles
- [x] §5 RLS expecting permissions not granted
- [x] §6 Bundles granting permissions unused by RLS
- [x] §7 Business operations without permissions
- [x] §8 Permissions without business operation
- [x] §9 Recommended catalog additions
- [x] §10 Recommended bundle corrections
- [x] §11 Recommended migration ordering after normalization

**No SQL, permission, bundle, role, RLS, or frontend changes were performed. Awaiting review before executing normalization sub-wave N1.**
