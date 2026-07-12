# Business Authorization V3 — Final Enterprise Model
# نموذج الصلاحيات المؤسسي النهائي — الإصدار الثالث

> **Scope:** Documentation only. No code, schema, RLS, DEFINER, edge function,
> authentication, or engine changes. This spec prepares the authorization model
> for a future implementation sprint.
>
> **النطاق:** توثيق فقط. لا تغييرات في الكود أو قاعدة البيانات أو سياسات RLS
> أو دوال الأمان أو وظائف الحافة أو المصادقة أو محرك الصلاحيات.

---

## 1. Role Model / نموذج الأدوار

Practice Pulse Plus is a **physiotherapy clinic** platform. The `Doctor` role
represents the treating physiotherapist. There is **no** separate
`physiotherapist` or `physio_admin` role.

| Code | English | Arabic | Scope |
|---|---|---|---|
| `system_owner` | System Owner | مالك النظام | Global |
| `super_admin` | Super Admin | مدير النظام | Global |
| `medical_director` | Medical Director | المدير الطبي | Single Branch |
| `admin_manager` | Administrative Manager | المدير الإداري | Single Branch |
| `branch_manager` | Branch Manager | مدير الفرع | Single Branch |
| `doctor` | Doctor (Physiotherapist) | الطبيب | Single Branch |
| `reception` | Reception | الاستقبال | Single Branch |
| `accountant` | Accountant | المحاسب | Single Branch |
| `cashier` | Cashier | أمين الخزينة | Single Branch |
| `hr` | HR | الموارد البشرية | Single Branch |
| `inventory_officer` | Inventory Officer | مسؤول المخزن | Single Branch |
| `marketing` | Marketing | التسويق | Single Branch |
| `auditor` | Auditor (Read Only) | المراجع | Single Branch — Read Only |

**Removed / Deprecated:** `physiotherapist`, `physio_admin`, `staff`
(catch-all), all `physio.*` permission keys. Clinical actions live under
`medical_records`, `treatment_plans`, and `exercises`.

---

## 2. Permission Actions Catalog / كتالوج الإجراءات

| Code | English | Arabic |
|---|---|---|
| `view` | View | عرض |
| `create` | Create | إنشاء |
| `edit` | Edit | تعديل |
| `delete` | Delete | حذف |
| `activate` | Activate | تفعيل |
| `deactivate` | Deactivate | تعطيل |
| `archive` | Archive | أرشفة |
| `approve` | Approve | اعتماد |
| `reject` | Reject | رفض |
| `review` | Review | مراجعة |
| `export` | Export | تصدير |
| `refund` | Refund | استرداد |
| `reverse` | Reverse | عكس عملية |
| `void` | Void | إلغاء |
| `assign` | Assign | تعيين |

---

## 3. User Lifecycle Authorization / دورة حياة المستخدم

### 3.1 User States / حالات المستخدم
`Pending` → `Active` → `Suspended` / `Deactivated` → `Deleted`.

### 3.2 Super Admin — Allowed
- ✅ Create User / إنشاء مستخدم
- ✅ Edit User / تعديل مستخدم
- ✅ Activate / Deactivate / Suspend User
- ✅ Reset Password / Force Logout

### 3.3 Super Admin — Forbidden
- ❌ Delete System Owner / حذف مالك النظام
- ❌ Delete self / حذف نفسه

### 3.4 System Owner — Exclusive
- ✅ Permanent user delete / حذف نهائي
- ✅ Delete Super Admin / حذف مدير النظام
- ✅ Restore deleted user / استرجاع مستخدم محذوف
- ✅ Full governance control / تحكم حوكمي كامل

---

## 4. Data Scope Rules / قواعد نطاق البيانات

**Every role except `system_owner` and `super_admin` MUST be restricted by:**

```
user.branch_id = resource.branch_id
```

- No cross-branch access. / لا يوجد وصول بين الفروع.
- Auditor is read-only within his single branch.
- Global roles bypass branch scoping only for governance operations, not for
  routine clinical or financial workflows.

---

## 5. Clinical Authorization Rules / قواعد الصلاحيات السريرية

### 5.1 Doctor / الطبيب
**Allowed:** Patients assigned to him; Medical Records create + edit own
draft; Treatment Plans create/edit own; Exercises create/edit programs.
**Forbidden:** Delete medical records; Payroll; Treasury; other branches.

### 5.2 Medical Director / المدير الطبي
**Allowed:** View all clinical data inside his branch; review medical
records; approve treatment plans and clinical documentation.
**Forbidden:** Directly edit a doctor's records; finance/payroll access.

---

## 6. Financial Authorization Rules / قواعد الصلاحيات المالية

Principle: **Creator ≠ Approver** (Segregation of Duties / فصل المهام).

### 6.1 Cashier / أمين الخزينة
- ✅ Create payments, view assigned transactions.
- ❌ Edit historical payments, approve payments, refund.

### 6.2 Accountant / المحاسب
- ✅ Invoices, payments, treasury, refund requests, financial reports.
- ❌ Cannot approve his own refund requests — requires Admin Manager or
  Branch Manager approval.

---

## 7. Replace Dangerous Deletes / استبدال عمليات الحذف الخطرة

Hard `delete` is restricted. Use lifecycle actions instead:

| Entity | Preferred Action | البديل |
|---|---|---|
| Patients | `archive` | أرشفة |
| Invoices | `void` | إلغاء |
| Payments | `reverse` | عكس |
| Expenses | `void` | إلغاء |
| Products | `deactivate` | تعطيل |

**Permanent delete:** `system_owner` only.

---

## 8. Permission Registry Update (Metadata Only) / تحديث سجل الصلاحيات

> Add labels/definitions only. No engine change.

### 8.1 New Clinical Keys
- `medical_records.approve` — Approve medical record / اعتماد سجل طبي
- `treatment_plans.approve` — Approve treatment plan / اعتماد الخطة العلاجية
- `exercises.view` — View exercise program / عرض برنامج التمارين
- `exercises.create` — Create exercise program / إنشاء برنامج التمارين
- `exercises.edit` — Edit exercise program / تعديل برنامج التمارين
- `exercises.archive` — Archive exercise program / أرشفة برنامج التمارين

### 8.2 New User Management Keys
- `users.activate`, `users.deactivate`, `users.suspend`, `users.delete`

### 8.3 New Finance Keys
- `payments.refund`, `payments.reverse`
- `expenses.approve`
- `treasury.approve`
- `invoice.void`

---

## 9. Deprecated Permissions / صلاحيات مهملة

Mark as `deprecated=true` (do not delete):

- `physio.*` — migrate to `medical_records.*` / `treatment_plans.*` / `exercises.*`.
- Role `physiotherapist` → merge into `doctor`.
- Role `physio_admin` → merge into `medical_director`.
- Role `staff` (catch-all) → replace with explicit role.
- `reports.view` / `reports.export` → replaced by `reports_<domain>.view` / `.export`.

---

## 10. Complete Permission Matrix / مصفوفة الصلاحيات

Legend: `V`=view, `C`=create, `E`=edit, `D`=delete, `A`=approve, `X`=export,
`R`=read-only, `—`=no access.

Global roles (`system_owner`, `super_admin`) hold **full** access across all
modules and are omitted from the per-module tables below for brevity.

### 10.1 Clinical Modules

| Role \ Module | Patients | Appointments | Queue | Medical Records | Treatment Plans | Exercises |
|---|---|---|---|---|---|---|
| medical_director | V,X | V,X | V | V,A,X | V,A,X | V,A |
| admin_manager | V,C,E,X | V,C,E,X | V,C,E | V,X | V,X | V |
| branch_manager | V,C,E,X | V,C,E,X | V,C,E | V | V | V |
| doctor | V (assigned) | V,C,E | V | V,C,E (own draft) | V,C,E (own) | V,C,E |
| reception | V,C,E | V,C,E | V,C,E | — | V | — |
| accountant | V | V | — | — | V | — |
| cashier | V | V | — | — | — | — |
| hr | — | — | — | — | — | — |
| inventory_officer | — | — | — | — | — | — |
| marketing | V (aggregate) | V | — | — | — | — |
| auditor | R | R | R | R | R | R |

### 10.2 Financial Modules

| Role \ Module | Invoices | Payments | Treasury | Expenses | Payroll |
|---|---|---|---|---|---|
| medical_director | V | V | — | — | — |
| admin_manager | V,A,X | V,A,X | V,A,X | V,A,X | V,A,X |
| branch_manager | V,X | V,X | V,X | V,X | V |
| doctor | — | — | — | — | V (own) |
| reception | V,C | V,C (via cashier flow) | — | — | — |
| accountant | V,C,E,void,X | V,C,refund-req,X | V,C,E,X | V,C,E,X | V,C,E,X |
| cashier | V | V,C | V (own drawer) | — | — |
| hr | — | — | — | V (HR-related) | V,C,E,X |
| inventory_officer | — | — | — | V (inventory) | — |
| marketing | — | — | — | V (marketing) | — |
| auditor | R | R | R | R | R |

### 10.3 HR & Operations

| Role \ Module | HR | Attendance | Leaves | Inventory | Purchases | Suppliers |
|---|---|---|---|---|---|---|
| medical_director | V | V | V,A | V | — | — |
| admin_manager | V,X | V,X | V,A,X | V,X | V,A,X | V,X |
| branch_manager | V | V,C,E | V,A | V | V | V |
| doctor | — | V (own) | V,C (own) | — | — | — |
| reception | — | V (own) | V,C (own) | — | — | — |
| accountant | — | V (own) | V,C (own) | V | V | V |
| cashier | — | V (own) | V,C (own) | — | — | — |
| hr | V,C,E,X | V,C,E,X | V,C,E,A,X | — | — | — |
| inventory_officer | — | V (own) | V,C (own) | V,C,E,X | V,C,E | V,C,E |
| marketing | — | V (own) | V,C (own) | — | — | — |
| auditor | R | R | R | R | R | R |

### 10.4 Reports, Analytics & Communication

| Role \ Module | Reports | Analytics | Marketing | Communication |
|---|---|---|---|---|
| medical_director | V,X (medical, operational) | V | — | V |
| admin_manager | V,X (all in branch) | V,X | V | V,C,E |
| branch_manager | V,X (all in branch) | V | V | V,C,E |
| doctor | V (medical, own) | — | — | V (patient comms) |
| reception | — | — | — | V,C (patient comms) |
| accountant | V,X (finance) | V (finance) | — | — |
| cashier | — | — | — | — |
| hr | V,X (HR) | V (HR) | — | — |
| inventory_officer | V,X (inventory) | V (inventory) | — | — |
| marketing | V (marketing) | V (marketing) | V,C,E,X | V,C,E |
| auditor | R | R | R | R |

### 10.5 Governance

| Role \ Module | Users | Roles | Permissions | Audit Logs | Settings |
|---|---|---|---|---|---|
| medical_director | V (branch) | V | — | V (clinical) | V |
| admin_manager | V,C,E (branch) | V | — | V (branch) | V,E (branch) |
| branch_manager | V (branch) | V | — | V (branch) | V |
| doctor | V (self) | — | — | V (own actions) | V (self) |
| reception | V (self) | — | — | — | V (self) |
| accountant | V (self) | — | — | V (finance) | V (self) |
| cashier | V (self) | — | — | V (own drawer) | V (self) |
| hr | V,C,E (HR scope) | V | — | V (HR) | V (self) |
| inventory_officer | V (self) | — | — | V (inventory) | V (self) |
| marketing | V (self) | — | — | — | V (self) |
| auditor | R | R | R | R (full branch) | R |

Global-only actions: `users.delete` (system_owner);
`users.activate` / `deactivate` / `suspend` (super_admin + admin_manager
within branch); permission registry edits (system_owner + super_admin).

---

## 11. Future Implementation Plan / خطة التنفيذ المستقبلية

- **Phase 1 — Permission Registry Update.** Add §8 keys, mark §9 keys
  deprecated. Metadata only.
- **Phase 2 — Role Bundle Migration.** Rebuild bundles per §10, retire
  `physiotherapist`, `physio_admin`, `staff`. Provide user re-mapping script.
- **Phase 3 — RLS Verification.** Confirm every branch-scoped table enforces
  `user.branch_id = resource.branch_id` and that delete pathways match §7
  (archive/void/reverse/deactivate).
- **Phase 4 — Authorization Testing.** Update shadow probes, role parity
  tests, and Playwright RBAC suites to cover the 13-role matrix bilingually.

---

## 12. Change Report / تقرير التغيير

- **Files created:** `docs/auth/BUSINESS_AUTHORIZATION_V3.md`
- **Files modified:** none
- **Files untouched:** all source code, migrations, RLS, DEFINER functions,
  edge functions, Supabase types, permission engine, UI components, role
  guards
- **Risks for future implementation:**
  1. Bundle migration must map existing `physio.*` grants to new clinical
     keys without breaking active users.
  2. Cashier ≠ Accountant separation may require a new RLS predicate on
     `payments` (approver column).
  3. Auditor read-only scope needs consistent RLS across every branch-scoped
     table; some analytics views lack coverage today.
  4. `system_owner` role does not exist in `app_role` enum yet — Phase 2
     will need a controlled enum-extension migration.
