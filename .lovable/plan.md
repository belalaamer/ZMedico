
# مراجعة كاملة للأدوار والصلاحيات — إعادة ضبط صارمة

## القواعد الحاكمة
1. **Delete = Admin فقط** في كل الموديولات بدون استثناء. أي دور تاني يعمل Cancel / Void / Soft-close حسب الموديول.
2. **Segregation of Duties صارم**: كل دور يشوف اللي يخص شغلته بس.
3. لازم يبقى فيه **تطابق كامل** بين ثلاث طبقات:
   - UI defaults (`DEFAULT_PERMISSIONS`)
   - جدول `role_permissions` في قاعدة البيانات (اللي بتقرأ منه `usePermissions`)
   - سياسات RLS على الجداول

## مصفوفة الصلاحيات الجديدة

Legend: `V`=view · `C`=create · `E`=edit · `X`=export · `—`=no access. **Delete محذوف من كل الأدوار ما عدا admin.**

| Module               | admin  | manager | doctor | nurse | receptionist | accountant | hr    | staff |
|----------------------|:------:|:-------:|:------:|:-----:|:------------:|:----------:|:-----:|:-----:|
| patients             | VCEX+D | VCEX    | V      | V     | VCE          | V          | —     | —     |
| appointments         | VCEX+D | VCEX    | VCE    | VCE   | VCE          | V          | —     | V     |
| medical_records      | VCEX+D | V       | VCE    | V     | —            | —          | —     | —     |
| vitals               | VCEX+D | V       | VCE    | VCE   | —            | —          | —     | —     |
| treatment_plans      | VCEX+D | V       | VCE    | V     | V            | V          | —     | —     |
| invoices             | VCEX+D | VX      | —      | —     | VC           | VCEX       | —     | —     |
| treasury             | VCEX+D | VX      | —      | —     | —            | VCEX       | —     | —     |
| inventory            | VCEX+D | VCEX    | —      | V     | —            | V          | —     | —     |
| coupons              | VCEX+D | VX      | —      | —     | V            | VCEX       | —     | —     |
| hr                   | VCEX+D | V       | —      | —     | —            | —          | VCEX  | —     |
| settings             | VCEX+D | V       | —      | —     | —            | —          | —     | —     |
| reports (index)      | VX     | VX      | V      | —     | —            | VX         | V     | —     |
| reports_finance      | VX     | VX      | —      | —     | —            | VX         | —     | —     |
| reports_medical      | VX     | VX      | V      | —     | —            | —          | —     | —     |
| reports_operational  | VX     | VX      | V      | —     | —            | VX         | —     | —     |
| reports_hr           | VX     | —       | —      | —     | —            | —          | VX    | —     |
| reports_inventory    | VX     | VX      | —      | —     | —            | VX         | —     | —     |

**التغييرات الأساسية عن الوضع الحالي:**
- Manager: خسر Create/Edit/Delete على الفواتير والكوبونات (بقى مراقب فقط) ولا يعدّل في السجل الطبي إطلاقاً.
- Receptionist: خسر Cancel-as-Delete على المواعيد → يتحول لـ status update عبر زر Cancel صريح. خسر Edit على الفواتير.
- Doctor: خسر Edit على بيانات المريض الديموغرافية (يعدّل السجل الطبي فقط).
- Nurse: خسر Edit على السجل الطبي وعلى خطط العلاج (view + vitals فقط).
- Accountant: خسر أي وصول للسجل الطبي بأي شكل.
- HR: صلاحياته على HR فقط + تقارير HR فقط.
- Staff: مواعيد view فقط (زي ما هو).

## الخطوات

### 1. UI layer — `src/lib/rolePermissions.ts`
إعادة كتابة `DEFAULT_PERMISSIONS` بالكامل حسب المصفوفة أعلاه، مع إزالة `delete` من كل الأدوار ما عدا admin.

### 2. Database layer — Migration واحدة
- **Seed جدول `role_permissions`**: `TRUNCATE` ثم `INSERT` صف واحد لكل (role, module) بالـ actions الصحيحة من المصفوفة، عشان الـ UI اللي في `RolePermissions.tsx` يعرض القيم الجديدة كنقطة بداية موحدة.
- **إصلاح RLS**:
  - `expenses`: حذف INSERT policy الخاصة بـ receptionist (المصاريف = accountant + manager + admin بس).
  - `coupons`: تضييق `Coupons manage by privileged roles` لتشمل admin + manager + accountant فقط (بدون receptionist). Receptionist عنده SELECT فقط عن طريق branch_isolation. + منع UPDATE/DELETE على coupons من manager (يقتصر على admin/accountant).
  - `appointments`: توحيد الـ policies المكررة وإزالة DELETE من الكل عدا `appts_delete_admin`.
  - `medical_records` / `vitals` / `prescriptions` / `treatment_plans`: التأكد إن nurse مالوش UPDATE على medical_records وعلى treatment_plans، ومالوش INSERT عليها.
  - `invoices` / `payments`: منع UPDATE من receptionist (INSERT فقط).
  - `patients`: منع UPDATE من doctor/nurse (SELECT فقط، الـ update عبر receptionist أو admin).
  - `staff_profiles`: التأكد إن الـ trigger الحالي `tg_staff_self_update_guard` كافي، وأضيف guard إضافي إن غير admin/hr مايعملش INSERT.
  - كل الجداول: التأكد إن `DELETE` policy موجودة صريحة `has_role(auth.uid(),'admin')` فقط (وإن الـ ALL policies تُقسم لـ SELECT/INSERT/UPDATE منفصلة عشان الـ DELETE ماياخدهاش بالغلط عن طريق `FOR ALL`).

### 3. Navigation — `src/components/layout/Sidebar.tsx` + `SettingsLayout.tsx`
مراجعة كل عنصر في السايدبار وربطه بـ `can(module, "view")` — أي عنصر ماعندوش view يختفي. الوضع الحالي غالباً بيعمل ده لكن هراجعه بند بند.

### 4. Route guards — `src/App.tsx`
- التأكد إن `PermissionRoute` مطبّق على كل مسار محمي (خاصة `/reports/*` الفرعية).
- إضافة `adminOnly` صريح على أي مسار حساس مش موجود عليه (مثلاً `/settings/backup`, `/settings/audit`, `/settings/users`, `/settings/roles`, `/system/self-audit`, `/queue/self-audit`, `/expenses/self-audit`).

### 5. UI action gating
- استبدال زر Delete في `RowActions.tsx` بـ Cancel/Archive/Void حسب الموديول للأدوار غير-admin.
- في `InvoiceDetail.tsx`: إخفاء أي زر تعديل من receptionist بعد الحفظ الأولي.
- في `Appointments`: زر Cancel بديل عن Delete للـ receptionist (تحديث status → cancelled بدل حذف صف).

### 6. توثيق — `docs/RBAC_MATRIX.md`
تحديث الملف بالكامل ليعكس المصفوفة الجديدة + قائمة السياسات المعدلة.

## ترتيب التنفيذ
1. Migration واحدة تجمع كل تغييرات الـ RLS + seed جدول `role_permissions`.
2. بعد اعتماد migration: تعديل `rolePermissions.ts` وباقي ملفات الـ UI.
3. تحديث التوثيق.

## خارج النطاق
- مفيش تغيير على `has_role` / `user_has_branch_access` / نظام الـ branches.
- مفيش تغيير على نموذج linking (linked_user_id) اللي اعتمدته قبل كده.
- مفيش تغيير على triggers الحسابية (invoices, treasury, wallet).

اعتمد الخطة وأنا هبدأ بالـ migration الأول ثم أكمل الـ UI بعد إعادة توليد الـ types.
