# Business Authorization V3.1 — Refinement Review
# مراجعة نموذج الصلاحيات المؤسسي — الإصدار 3.1

> **Scope:** Documentation only. Refines `docs/auth/BUSINESS_AUTHORIZATION_V3.md`
> ahead of implementation. **No** code, schema, RLS, DEFINER, edge function,
> authentication, permission-engine, or migration changes are performed by
> this document.
>
> **النطاق:** توثيق فقط. لا تعديلات على الكود أو قاعدة البيانات أو RLS أو
> دوال الأمان أو وظائف الحافة أو المصادقة أو محرك الصلاحيات.

---

## 1. Change Summary / ملخص التغييرات

V3.1 tightens six areas of the V3 model without changing its role list or
branch-isolation principles:

1. **System Owner** is reclassified as a *root governance identity*
   (break-glass only), not an operational role. Not assignable via normal UI.
2. **Administrative Manager** loses direct `users.create` and role-assignment
   powers; replaced by request-based workflow gated on Super Admin approval.
3. **Clinical review workflow** added: Doctor submits → Medical Director
   reviews / approves / rejects → approved records are locked.
4. **Doctor clinical scope** clarified: create/edit only own *draft*
   records; never delete; never modify approved records.
5. **Refund segregation of duties** formalized as a three-hand workflow:
   Cashier requests → Accountant reviews → Branch Manager approves; Super
   Admin emergency override.
6. **User deletion lifecycle** split into Deactivate → Soft Delete →
   Permanent Delete, with Permanent Delete reserved for System Owner.

All existing V3 principles remain in force: branch isolation, least
privilege, segregation of duties, no hard delete for business records,
clinical auditability, financial accountability.

---

## 2. Updated Role Rules / قواعد الأدوار المحدثة

### 2.1 System Owner / مالك النظام — Governance Root
- Root governance identity, **not** a day-to-day operator.
- **Not assignable** through the normal Users UI. Provisioned only through
  a documented break-glass procedure (out-of-band, dual-control, logged).
- Reserved capabilities:
  - Permanent user delete (§4).
  - Delete Super Admin.
  - Restore soft-deleted users.
  - Governance override on any workflow (including refund emergency override).
- MUST NOT appear in standard role pickers, invitation flows, or
  admin-manager provisioning screens.
- Every action logged with `resource_type='governance_break_glass'`.

### 2.2 Super Admin / مدير النظام — Daily Administration
- Primary administrative role for day-to-day operations.
- Owns user provisioning approvals from Administrative Manager requests.
- Can deactivate and soft-delete users (§4). Cannot permanently delete.
- Cannot delete System Owner. Cannot delete self.

### 2.3 Administrative Manager / المدير الإداري — Request-Only
- **Removed:** `users.create`, direct role assignment.
- **Added:**
  - `users.request_creation` — طلب إنشاء مستخدم
  - `users.request_role_change` — طلب تغيير دور
- Workflow: Administrative Manager submits request → Super Admin reviews →
  Super Admin approves/rejects → user is provisioned/updated.
- Retains branch-scoped operational, financial, and HR authorities per V3
  §10.

### 2.4 Medical Director / المدير الطبي — Clinical Reviewer
- **Added review actions** (see §3):
  - `medical_records.review` — مراجعة السجل الطبي
  - `treatment_plans.review` — مراجعة الخطة العلاجية
  - `exercises.review` — مراجعة برنامج التمارين
- Continues to hold `.approve` on the same entities. `reject` is added as
  a first-class action (§6) to close the review loop.
- Cannot directly edit a Doctor's clinical content — only review, approve,
  or reject.

### 2.5 Doctor (Physiotherapist) / الطبيب — Draft-Bounded Author
- **Can:**
  - Create medical records.
  - Edit **only** own draft / unapproved records.
  - Create and modify treatment plans and exercise programs **before**
    approval.
  - Submit records for review.
- **Cannot:**
  - Delete medical records (any state).
  - Modify records once `approved` (locked).
  - Access other branches or unassigned patients.

### 2.6 Cashier / Accountant / Branch Manager — Refund Workflow
See §5. New actions: `payments.refund_request`, `payments.refund_review`,
`payments.refund_approve`. Legacy `payments.refund` is deprecated in favor
of the workflow triad.

---

## 3. Clinical Approval Workflow / سير اعتماد السجلات السريرية

```
Doctor            Medical Director
  │                     │
  ├─ create ───────────►│
  ├─ edit (draft) ─────►│
  ├─ submit_review ────►│  medical_records.review
  │                     ├─ approve  → record LOCKED
  │                     └─ reject   → back to Doctor as draft (with reason)
```

- **States:** `draft` → `submitted` → `approved` (locked) | `rejected` (→ draft).
- Applies identically to `medical_records`, `treatment_plans`, `exercises`.
- `approved` records are immutable. Corrections require an amendment
  record linked to the original (documented as a requirement; schema
  design deferred to implementation).
- Every state transition MUST be audit-logged with actor, timestamp, and
  reason (required on `reject`).

---

## 4. User Lifecycle / دورة حياة المستخدم

| State | Effect | Who can trigger |
|---|---|---|
| `active` | Normal access | Provisioning |
| `deactivated` | Temporary disable; sessions revoked; data preserved; reversible | Super Admin (Administrative Manager via request) |
| `soft_deleted` | User archived; audit history retained; hidden from lists; reversible by System Owner | Super Admin |
| `permanently_deleted` | PII purged per retention policy; audit references retained by user_id hash | **System Owner only** |

Rules:
- Super Admin **cannot** permanently delete.
- System Owner **cannot** be deleted by anyone but System Owner via
  break-glass co-signature.
- Administrative Manager can request deactivation / soft-delete but cannot
  execute them directly.
- Reactivation of `soft_deleted` requires System Owner.

---

## 5. Refund Segregation of Duties / فصل مهام الاسترداد

```
Cashier                Accountant              Branch Manager        Super Admin
  │                        │                         │                    │
  ├─ refund_request ──────►│                         │                    │
  │                        ├─ refund_review ────────►│                    │
  │                        │  (approve/return)       │                    │
  │                        │                         ├─ refund_approve    │
  │                        │                         │  → executed        │
  │                        │                         │                    │
  │◄─────────── emergency override ───────────────────────────────────────┤
```

- **Cashier:** `payments.refund_request` — طلب استرداد.
- **Accountant:** `payments.refund_review` — مراجعة طلب الاسترداد.
- **Branch Manager:** `payments.refund_approve` — اعتماد الاسترداد.
- **Super Admin:** emergency override, fully audit-logged with justification.
- No single role can complete a refund end-to-end. Legacy
  `payments.refund` becomes deprecated; existing grants must be migrated
  during implementation.

---

## 6. Permission Registry Additions / إضافات سجل الصلاحيات

### 6.1 New Action Verbs (bilingual)

| Action | English | Arabic |
|---|---|---|
| `review` | Review | مراجعة |
| `reject` | Reject | رفض |
| `request` | Request | طلب |
| `activate` | Activate | تفعيل |
| `deactivate` | Deactivate | تعطيل |
| `archive` | Archive | أرشفة |
| `refund_request` | Request Refund | طلب استرداد |
| `refund_review` | Review Refund | مراجعة الاسترداد |
| `refund_approve` | Approve Refund | اعتماد الاسترداد |

### 6.2 New Permission Keys

Clinical / سريري:
- `medical_records.review` — مراجعة السجل الطبي
- `medical_records.reject` — رفض السجل الطبي
- `treatment_plans.review` — مراجعة الخطة العلاجية
- `treatment_plans.reject` — رفض الخطة العلاجية
- `exercises.review` — مراجعة برنامج التمارين
- `exercises.reject` — رفض برنامج التمارين

User Management / إدارة المستخدمين:
- `users.request_creation` — طلب إنشاء مستخدم
- `users.request_role_change` — طلب تغيير دور
- `users.activate` — تفعيل مستخدم
- `users.deactivate` — تعطيل مستخدم
- `users.archive` — أرشفة مستخدم (soft delete)
- `users.delete` — حذف نهائي (System Owner only)

Finance / مالي:
- `payments.refund_request` — طلب استرداد
- `payments.refund_review` — مراجعة استرداد
- `payments.refund_approve` — اعتماد استرداد

### 6.3 Deprecations

| Deprecated | Replacement |
|---|---|
| `payments.refund` | `payments.refund_request` + `.refund_review` + `.refund_approve` |
| `users.create` on Administrative Manager bundle | `users.request_creation` |
| Direct role-assign on Administrative Manager | `users.request_role_change` |

Deprecated keys stay in the registry with `deprecated=true` until Phase 2
migration retires them per the standing lifecycle policy.

---

## 7. Updated Lifecycle Rules Summary / ملخص قواعد دورات الحياة

| Domain | States | Reversible? | Terminal Actor |
|---|---|---|---|
| Users | active → deactivated → soft_deleted → permanently_deleted | Yes until permanent | System Owner |
| Medical records / Treatment plans / Exercises | draft → submitted → approved (locked) / rejected | Reject returns to draft; approve is terminal | Medical Director |
| Refunds | requested → reviewed → approved → executed | Reject returns to Cashier | Branch Manager (or Super Admin override) |
| Business records (patients/invoices/payments/expenses/products) | Per V3 §7 (archive/void/reverse/deactivate) | Yes | System Owner for hard delete |

---

## 8. Implementation Notes / ملاحظات التنفيذ

1. **Registry-first.** Add the new keys/verbs to `authz_permissions`
   metadata with bilingual labels before touching any bundle.
2. **Bundle migration order:** (a) grant new request/review/approve keys
   to the correct roles; (b) revoke deprecated keys; (c) run parity harness.
3. **State machines** for clinical records and refunds should be modeled
   explicitly (status column + transition function) rather than inferred
   from timestamps. Document only — no schema change here.
4. **System Owner provisioning** must live outside the normal Users UI:
   e.g., a sealed migration or a dedicated break-glass edge function
   guarded by dual-control secrets. Not scoped for this document.
5. **UI guards** must hide System Owner from role pickers and hide
   `users.create` from Administrative Manager surfaces once the request
   workflow is live.
6. **Audit expectations:** every new action (review, reject, request,
   refund_*) must emit an audit log entry with actor, target, branch,
   and reason where applicable.
7. **Testing:** extend RBAC parity + shadow probes to cover the three-hand
   refund flow and the doctor→medical-director review flow bilingually.
8. **Backward compatibility:** Phase 2 migration script must translate
   existing `payments.refund` grants and existing Administrative Manager
   `users.create` grants to the new keys before deprecation removal.

---

## 9. Compliance Statement / بيان الامتثال

- Files created: `docs/auth/BUSINESS_AUTHORIZATION_V3.1_REVIEW.md`
- Files modified: none
- Files untouched: all source code, migrations, RLS, DEFINER functions,
  edge functions, Supabase types, permission engine, UI components, role
  guards, authentication configuration.
- No database or runtime changes were executed.
