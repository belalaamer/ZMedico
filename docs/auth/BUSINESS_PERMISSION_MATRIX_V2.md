# Business Permission Matrix V2 — Practice Pulse Plus

**Scope:** Physiotherapy clinic management system. Business authorization redesign only. Documentation-only deliverable — no code, schema, RLS, DEFINER, edge function, or type changes.

**Domain note:** This system serves a physiotherapy clinic. There is **no** separate "Physiotherapist" role or "Physiotherapist module". The treating clinician is modeled as the `Doctor` role (English) / `الطبيب` (Arabic). Any prior "physio.*" permission surface is folded into `medical_records.*`, `treatment_plans.*`, and the new `exercises.*` module. All clinical permissions live in one place — no duplication between Doctor and a legacy Physiotherapist role.

**Branch scope rule:** Every role except `Super Admin` is single-branch. All allow cells below are implicitly scoped to the user's assigned branch unless the cell explicitly says otherwise. This mirrors the existing branch-scoping already enforced in RLS and `BranchContext`; the matrix does not change that mechanism, only the WHO/WHAT.

---

## 1. Roles (Bilingual)

| Code | English | Arabic | Scope | Category |
|---|---|---|---|---|
| `super_admin` | Super Admin | مدير النظام | Global (all branches) | Governance |
| `medical_director` | Medical Director | المدير الطبي | Single branch | Clinical leadership (NEW) |
| `admin_manager` | Administrative Manager | المدير الإداري | Single branch | Operations leadership (NEW) |
| `branch_manager` | Branch Manager | مدير الفرع | Single branch | Branch operations |
| `reception` | Reception | الاستقبال | Single branch | Front desk |
| `doctor` | Doctor | الطبيب | Single branch | Clinical (treating physiotherapist) |
| `accountant` | Accountant | المحاسب | Single branch | Finance |
| `cashier` | Cashier | أمين الخزينة | Single branch | Finance — treasury till |
| `hr` | HR | الموارد البشرية | Single branch | People ops |
| `inventory_officer` | Inventory Officer | مسؤول المخزن | Single branch | Supply chain |
| `marketing` | Marketing | التسويق | Single branch | Growth |
| `viewer` | Viewer | عرض فقط | Single branch | Read-only |

**Removed / consolidated:** `physiotherapist`, `physio_admin`, standalone `staff` catch-all — all folded into `doctor`, `reception`, or `viewer`.

---

## 2. Modules (Bilingual)

| Code | English | Arabic |
|---|---|---|
| `dashboard` | Dashboard | لوحة التحكم |
| `patients` | Patients | المرضى |
| `appointments` | Appointments | المواعيد |
| `calendar` | Calendar | التقويم |
| `queue` | Queue / Waiting List | قائمة الانتظار |
| `medical_records` | Medical Records | السجلات الطبية |
| `treatment_plans` | Treatment Plans | الخطط العلاجية |
| `exercises` | Exercise Programs | برامج التمارين |
| `invoices` | Invoices | الفواتير |
| `payments` | Payments | المدفوعات |
| `treasury` | Treasury | الخزينة |
| `expenses` | Expenses | المصروفات |
| `payroll` | Payroll | الرواتب |
| `hr` | HR | الموارد البشرية |
| `attendance` | Attendance | الحضور |
| `leaves` | Leaves | الإجازات |
| `departments` | Departments | الأقسام |
| `inventory` | Inventory | المخزون |
| `products` | Products | المنتجات |
| `purchases` | Purchases | المشتريات |
| `suppliers` | Suppliers | الموردون |
| `reports_medical` | Medical Reports | التقارير الطبية |
| `reports_finance` | Financial Reports | التقارير المالية |
| `reports_operational` | Operational Reports | التقارير التشغيلية |
| `reports_hr` | HR Reports | تقارير الموارد البشرية |
| `reports_inventory` | Inventory Reports | تقارير المخزون |
| `analytics` | Analytics | التحليلات |
| `marketing` | Marketing | التسويق |
| `campaigns` | Campaigns | الحملات |
| `communication` | Communication | التواصل |
| `notifications` | Notifications | الإشعارات |
| `settings` | Settings | الإعدادات |
| `users` | Users | المستخدمون |
| `roles` | Roles | الأدوار |
| `permissions` | Permissions | الصلاحيات |
| `branches` | Branches | الفروع |
| `system_config` | System Configuration | إعدادات النظام |
| `audit_logs` | Audit Logs | سجلات التدقيق |
| `backup` | Backup | النسخ الاحتياطي |
| `restore` | Restore | الاستعادة |

---

## 3. Actions (Bilingual)

| Code | English | Arabic |
|---|---|---|
| `view` | View | عرض |
| `create` | Create | إنشاء |
| `edit` | Edit | تعديل |
| `delete` | Delete | حذف |
| `export` | Export | تصدير |
| `approve` | Approve | اعتماد |
| `restore` | Restore | استعادة |
| `manage` | Manage | إدارة |

**Cell legend:**

| Symbol | Meaning |
|---|---|
| ✅ | Allowed (branch-scoped where applicable) |
| ❌ | Not allowed |
| 🏢 | Branch only (explicit reminder) |
| 👤 | Own patients / own records only |
| 📋 | Assigned only |
| 👁 | Read only |
| ✔️ | Approval only (no edit) |

---

## 4. Complete Business Permission Matrix

Column order: **SA** Super Admin · **MD** Medical Director · **AM** Administrative Manager · **BM** Branch Manager · **RC** Reception · **DR** Doctor · **AC** Accountant · **CS** Cashier · **HR** HR · **IN** Inventory · **MK** Marketing · **VW** Viewer.

### 4.1 Governance & Access

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dashboard | view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 👁 |
| users | view | ✅ | ❌ | ✅🏢 | ✅🏢 | ❌ | ❌ | ❌ | ❌ | ✅🏢 | ❌ | ❌ | ❌ |
| users | create | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| users | edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| users | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| roles | view / manage | ✅ / ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| permissions | view / manage | ✅ / ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| branches | view | ✅ | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 | ✅🏢 |
| branches | create / edit / delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| system_config | view / edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| settings | view | ✅ | ❌ | ✅🏢 | ✅🏢 | ❌ | ❌ | ✅🏢 | ❌ | ✅🏢 | ✅🏢 | ✅🏢 | ❌ |
| settings | edit | ✅ | ❌ | ✅🏢 | ✅🏢 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| audit_logs | view / export | ✅ / ✅ | ❌ | ✅🏢 / ✅🏢 | ✅🏢 / ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| backup | manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| restore | manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 4.2 Front Desk & Scheduling

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| patients | view | ✅ | ✅ | ✅ | ✅ | ✅ | 👤 | ✅ | ❌ | ❌ | ❌ | 👁 | 👁 |
| patients | create | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| patients | edit | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| patients | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| patients | export | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| appointments | view | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | ✅ | ❌ | ❌ | 👁 | 👁 |
| appointments | create | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| appointments | edit | ✅ | ❌ | ✅ | ✅ | ✅ | 📋 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| appointments | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| appointments | export | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| calendar | view | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | ✅ | ✅ | ✅ | ❌ | ❌ | 👁 |
| queue | view | ✅ | ✅ | ✅ | ✅ | ✅ | 📋 | ❌ | ❌ | ❌ | ❌ | ❌ | 👁 |
| queue | manage | ✅ | ❌ | ✅ | ✅ | ✅ | 📋 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 4.3 Clinical (single unified clinician surface — Doctor = treating physiotherapist)

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| medical_records | view | ✅ | ✅ | ❌ | 👁 | ❌ | 👤 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| medical_records | create | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| medical_records | edit | ✅ | ❌ | ❌ | ❌ | ❌ | 👤 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| medical_records | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| medical_records | approve | ✅ | ✔️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| medical_records | export | ✅ | ✅ | ❌ | ❌ | ❌ | 👤 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| treatment_plans | view | ✅ | ✅ | 👁 | 👁 | 👁 | 👤 | 👁 | ❌ | ❌ | ❌ | ❌ | ❌ |
| treatment_plans | create / edit | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ / 👤 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| treatment_plans | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| treatment_plans | approve | ✅ | ✔️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| exercises | view | ✅ | ✅ | ❌ | 👁 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| exercises | create / edit | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| exercises | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 4.4 Finance

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| invoices | view | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| invoices | create | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| invoices | edit | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| invoices | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| invoices | approve | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| invoices | export | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| payments | view | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments | create | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments | edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| payments | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| payments | export | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| treasury | view | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| treasury | create (transaction) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| treasury | edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| treasury | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| treasury | approve (close) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| treasury | export | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| expenses | view | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| expenses | create / edit | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| expenses | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| expenses | approve | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 4.5 HR & Payroll

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hr | view | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| hr | create / edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| hr | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| hr | export | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| attendance | view | ✅ | ✅ | ✅ | ✅ | 👤 | 👤 | ❌ | 👤 | ✅ | 👤 | 👤 | ❌ |
| attendance | create (check-in) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| attendance | edit | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| attendance | approve | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| leaves | view | ✅ | ✅ | ✅ | ✅ | 👤 | 👤 | 👤 | 👤 | ✅ | 👤 | 👤 | ❌ |
| leaves | create (request) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| leaves | approve | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| departments | view / manage | ✅ / ✅ | ❌ | ✅ / ❌ | ✅ / ❌ | ❌ | ❌ | ❌ | ❌ | ✅ / ✅ | ❌ | ❌ | ❌ |
| payroll | view | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| payroll | create / edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| payroll | approve | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| payroll | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| payroll | export | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### 4.6 Inventory & Procurement

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inventory | view | ✅ | ❌ | ✅ | ✅ | ❌ | 👁 | ✅ | ❌ | ❌ | ✅ | ❌ | 👁 |
| inventory | create / edit | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| inventory | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory | export | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| products | view | ✅ | ❌ | ✅ | ✅ | ❌ | 👁 | ✅ | ❌ | ❌ | ✅ | ❌ | 👁 |
| products | create / edit | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| products | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| purchases | view | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| purchases | create / edit | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| purchases | approve | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| purchases | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| suppliers | view | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| suppliers | create / edit | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| suppliers | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 4.7 Reports & Analytics

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reports_medical | view / export | ✅ / ✅ | ✅ / ✅ | ❌ | ✅ / ✅ | ❌ | 👤 / 👤 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| reports_finance | view / export | ✅ / ✅ | ❌ | ✅ / ✅ | ✅ / ✅ | ❌ | ❌ | ✅ / ✅ | 👁 / ❌ | ❌ | ❌ | ❌ | ❌ |
| reports_operational | view / export | ✅ / ✅ | ✅ / 👁 | ✅ / ✅ | ✅ / ✅ | ❌ | 👁 / ❌ | ✅ / ✅ | ❌ | ❌ | ❌ | 👁 / ❌ | ❌ |
| reports_hr | view / export | ✅ / ✅ | ❌ | ✅ / ❌ | ✅ / ❌ | ❌ | ❌ | ❌ | ❌ | ✅ / ✅ | ❌ | ❌ | ❌ |
| reports_inventory | view / export | ✅ / ✅ | ❌ | ✅ / ✅ | ✅ / ✅ | ❌ | ❌ | ✅ / ✅ | ❌ | ❌ | ✅ / ✅ | ❌ | ❌ |
| analytics | view | ✅ | ✅ | ✅ | ✅ | ❌ | 👤 | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |

### 4.8 Marketing & Communication

| Module | Action | SA | MD | AM | BM | RC | DR | AC | CS | HR | IN | MK | VW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| marketing | view | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| marketing | create / edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| marketing | delete / approve | ✅ / ✅ | ❌ | ❌ / ✅ | ❌ / ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ / ❌ | ❌ |
| campaigns | view | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| campaigns | create / edit | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| campaigns | delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| campaigns | approve | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| communication | view | ✅ | ✅ | ✅ | ✅ | ✅ | 👤 | ✅ | ❌ | ✅ | ❌ | ✅ | 👁 |
| communication | create (send) | ✅ | ❌ | ✅ | ✅ | ✅ | 👤 | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| notifications | view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| notifications | manage (config) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 5. Business Rules & Guardrails

**Universal:**
1. `delete` is Super Admin exclusive across every module. All other roles use status transitions (cancel / void / archive), which are surfaced as `edit` not `delete`.
2. Every role except Super Admin is single-branch. `has_branch_access(auth.uid(), row.branch_id)` remains the authoritative RLS filter; the matrix does not override it.
3. `approve` is separate from `edit`. Approvals are terminal actions; edit rights to a record do not confer approval rights.
4. Export is a distinct action; view does not imply export. Bulk PII/PHI export requires explicit `export` grant.
5. `restore` and `backup` are Super Admin only.

**Role-specific:**
- **Reception** — front desk: register/edit patients, book/edit appointments, create invoices, send communications. Never sees payroll, treasury balances, salaries, permissions, or other branches.
- **Doctor (treating physiotherapist)** — clinical only. Owns medical records, treatment plans, and exercise programs for their assigned patients (`👤`). Cannot delete finalized records, cannot see finance, treasury, payroll, users, or other branches.
- **Medical Director** — clinical supervision inside one branch. Reads all medical records/plans/exercises in-branch, approves records and plans, reviews therapist performance via `reports_medical` and `analytics`. Cannot edit clinical content directly (approval-only workflow), cannot touch finance, payroll, or user management.
- **Administrative Manager** — operational supervision inside one branch. Owns reception workflow, scheduling, patient administration, invoice creation, staff scheduling, branch operational reporting. Explicitly excluded from clinical editing, payroll, permission management, treasury edits.
- **Branch Manager** — full branch operational authority: hires-adjacent HR view, treasury view, invoice edit/approve, expenses/purchases approve, inventory edit, branch reports. Cannot manage users, permissions, branches, or global settings.
- **Accountant** — finance only. Invoices, payments, treasury, refunds, expenses, financial + inventory + operational reports. No clinical, no permissions, no HR-writes (payroll approve only from finance side).
- **Cashier** — treasury till operator: takes payments, records treasury transactions, sees treasury balances. Cannot edit or approve, cannot see invoices beyond payment context, cannot export.
- **HR** — people ops: employee records, attendance/leaves approvals, payroll preparation, HR reports. No clinical, finance, or inventory writes.
- **Inventory Officer** — supply chain: inventory/products/purchases/suppliers write, inventory reports. Read-only elsewhere.
- **Marketing** — campaigns, communications, marketing analytics. No PHI export, no patient edit.
- **Viewer** — read-only observer for training/audit. Never writes, never exports.
- **Super Admin** — global override for governance, break-glass, and cross-branch operations.

---

## 6. Missing Permissions (to add in registry)

These permission keys exist as business operations in V2 but are missing from the current v2 permission registry / RBAC matrix:

1. `medical_records.approve` — required by Medical Director workflow.
2. `treatment_plans.approve` — required by Medical Director workflow.
3. `exercises.view` / `create` / `edit` / `delete` — the new consolidated "Exercise Programs" module replacing scattered `physio.*` keys.
4. `invoices.approve` — Branch Manager / Accountant approval gate.
5. `payments.create` / `edit` / `delete` / `export` — currently NEW per N3.
6. `expenses.view/create/edit/delete/approve/export` — currently NEW per N3.
7. `payroll.view/create/edit/delete/approve/export` — HR + Accountant surface.
8. `treasury.approve` — daily-close authorization for Accountant.
9. `attendance.view/create/edit/approve` and `leaves.view/create/approve` — HR workflow.
10. `departments.view/manage` — HR org structure.
11. `purchases.view/create/edit/approve/delete` and `suppliers.view/create/edit/delete` and `products.view/create/edit/delete` — Inventory Officer surface.
12. `marketing.view/create/edit/delete/approve` and `campaigns.*` — Marketing surface.
13. `communication.view/create` and `notifications.view/manage` — cross-role messaging.
14. `analytics.view` — separate from `reports_*`.
15. `audit_logs.view/export` — replaces overloaded `settings.export` on audit tables (already flagged in N4).
16. `backup.manage`, `restore.manage` — Super Admin governance actions.

All must be added with English + Arabic labels and mapped into bundles in a follow-up implementation task.

---

## 7. Redundant Permissions (to retire)

1. **`physio.*` (6 keys)** — no separate physio role exists. Fold into `medical_records.*`, `treatment_plans.*`, and the new `exercises.*` module. Prevents Doctor/Physiotherapist duplication.
2. **`reports.view` / `reports.export`** — umbrella keys already superseded by the five `reports_<domain>` keys. Marked `USED (deprecate)` in N3; retire.
3. **`settings.export` on audit tables** — misuse flagged in N4; replaced by `audit_logs.export`.
4. **`vitals.*`** — physiotherapy clinic does not maintain a distinct vitals surface; folds into `medical_records.*`. Retire once no RLS references remain.
5. **`staff` role** — catch-all role with only `appointments.view`. Users on this role should be moved to `viewer` (read-only observer) or `reception`. Retire the role.

---

## 8. Dangerous Permissions (require review)

1. **Any role holding `delete` on clinical or financial modules** — matrix restricts `delete` to Super Admin universally. Confirm no bundle grants clinical/financial `delete` to non-admin roles.
2. **`permissions.manage` outside Super Admin** — must never be granted to Medical Director, Administrative Manager, or Branch Manager. Prevents privilege escalation inside a branch.
3. **`users.create` / `users.edit` outside Super Admin** — user provisioning is centralized to prevent branch managers from minting cross-branch identities.
4. **`payroll.view` for non-HR/non-Accountant roles** — must never leak to Branch Manager, Administrative Manager, or Medical Director. Salary confidentiality.
5. **`treasury.edit` outside Accountant/Super Admin** — cash-handling separation of duties: Cashier can create transactions but not edit historic ones.
6. **`medical_records.edit` outside Doctor (own) / Super Admin** — PHI integrity. Medical Director uses `approve`, not `edit`.
7. **`invoices.delete` / `payments.delete` outside Super Admin** — financial audit trail integrity.
8. **Cross-branch data access via `Super Admin` bundle on any operational role** — verify no non-SA bundle silently includes cross-branch grants.
9. **`backup.manage` / `restore.manage`** — destructive; Super Admin only, with confirmation flow at UI level.
10. **`audit_logs.export`** — leaks user activity; restrict to Super Admin and Administrative Manager (branch-scoped).

---

## 9. Recommended Permission Changes (summary)

| # | Change | Rationale |
|---|---|---|
| 1 | Introduce `medical_director` and `admin_manager` roles with bundles as above | Clinical vs operational supervision split, matches international clinic best practice |
| 2 | Retire `physiotherapist` / `physio_admin` role concepts and `physio.*` permissions | Doctor IS the treating physiotherapist; no duplication |
| 3 | Add `exercises` module and permissions | Replace scattered physio session/exercise keys with one clear surface |
| 4 | Add `approve` action to `medical_records`, `treatment_plans`, `invoices`, `expenses`, `treasury`, `payroll`, `campaigns`, `attendance`, `leaves`, `purchases` | Explicit approval separation from edit |
| 5 | Split `settings.export` for audit tables into `audit_logs.*` | Removes semantic overload flagged in N4 |
| 6 | Deprecate umbrella `reports.view/export` | Domain-scoped `reports_*` keys already in place |
| 7 | Add branch scoping check to every non-SA bundle in the invariant test | Enforce single-branch rule at CI time |
| 8 | Merge `staff` users into `viewer` or `reception` and retire role | Reduce role sprawl |
| 9 | Add `Cashier` bundle: `payments.create`, `treasury.view/create`, `attendance.create` | Formalize till operator role |
| 10 | Add `Marketing` bundle: `marketing.*` (no delete), `campaigns.*` (no delete/approve), `communication.view/create`, `analytics.view` | Formalize marketing role |
| 11 | Add `Inventory Officer` bundle covering the inventory/products/purchases/suppliers write surface | Formalize supply-chain role |
| 12 | Bilingual labels stored in a small additive lookup (`role_labels`, `permission_labels`, `module_labels`) — English + Arabic — if not already covered by i18n JSON | Regulatory + UX requirement |

All changes are additive to the existing engine — no changes to authorization mechanics, RLS shape, or DEFINER surface.

---

## 10. Final Production-Ready Permission Matrix

The matrix in §4 (governance, front desk, clinical, finance, HR/payroll, inventory, reports, marketing/communication) constitutes the **final approved V2 business permission matrix** for Practice Pulse Plus.

**Acceptance criteria for a future implementation task:**
- Every permission key in §4 exists in the permission registry with English + Arabic label.
- Every role in §1 has a bundle whose grants exactly match its column across §4.1–§4.8.
- Every non-Super-Admin bundle passes the invariant test: no cross-branch grants, no `delete` on clinical/financial modules, no `permissions.manage`, no `users.create/edit`.
- Retired permissions in §7 are removed from all bundles.
- No Doctor/Physiotherapist permission duplication remains.
- UI labels (roles, modules, actions) render both English and Arabic.

---

**Document status:** Business specification. Ready for implementation planning. No code, schema, RLS, DEFINER, edge function, type, dependency, or configuration changes were made in producing this document.