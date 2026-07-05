# مراجعة صلاحيات شاملة (Least Privilege) — خطة تنفيذ

الحجم كبير جدًا (7 أدوار × ~40 module × 6+ actions × RLS + Edge Functions + Exports + Field-level). عشان النتيجة تكون **حقيقية مش شكلية**، هنقسّمها على **4 مراحل** كل مرحلة تخرج قابلة للاختبار قبل ما نروح للي بعدها.

---

## Phase 1 — Discovery & Ground Truth (قبل أي تعديل)

المخرجات: تقرير واحد `docs/RBAC_AUDIT.md` فيه:

1. **جرد كامل**:
   - كل route في `App.tsx` + الـ guard الحالي.
   - كل عنصر في `Sidebar.tsx` + `SettingsLayout.tsx` + شرط الظهور.
   - كل جدول (95 جدول) + policies الحالية (SELECT/INSERT/UPDATE/DELETE) لكل دور.
   - كل edge function + من يقدر يستدعيها + الـ JWT check.
   - كل scheduled job (pg_cron) + الـ secret/role اللي بتشتغل بيه.
   - كل export/print action (invoicePdf, prescriptionPdf, reportExport, exportGuard).
   - كل field حساس (salary, national_id, bank_account, commission_percent, cost, wallet balance...).

2. **Deny-by-default gap analysis**: كل مكان مفيهوش guard صريح = ثغرة موثقة.

3. **الـ matrix النهائية** (role × module × action × field-mask) تتحط في `docs/RBAC_MATRIX.md` كـ single source of truth.

بدون هذه المرحلة، أي "إصلاح" هيكون تخمين.

---

## Phase 2 — Database Hardening (RLS = Source of Truth)

قاعدة: **UI-only guards = صفر أمن**. كل شيء يتفرض في DB.

1. **Revoke-then-Grant**: على كل جدول public: `REVOKE ALL ... FROM authenticated`، ثم `GRANT` محدود.
2. **RLS شامل**: كل جدول مفيهوش policy لدور = deny تلقائي. نراجع الـ 95 جدول واحد واحد.
3. **Column-level security** للحقول الحساسة عبر:
   - Views (`staff_profiles_public` بدون salary/bank/national_id) للأدوار غير HR/Admin.
   - `GRANT SELECT (col1, col2, ...)` بدل `GRANT SELECT` الكامل حيث ينطبق.
4. **SECURITY DEFINER audit**: كل function موجودة (`apply_wallet_tx`, `apply_inventory_tx`, `apply_coupon_code`, `add_treasury_tx`, `fn_resolve_coverage`, ...) نتأكد إن فيها `has_role` check صريح.
5. **DELETE = Admin only** يتفرض في RLS مش UI.
6. **Audit triggers** على الجداول الحساسة اللي لسه مفيهاش (coupons, insurance_contracts, role_permissions, user_roles, staff_profiles salary changes).

Migration واحد كبير مقسّم لـ sections موثقة.

---

## Phase 3 — Edge Functions & Scheduled Jobs

1. `admin-create-user`, `admin-delete-user`, `admin-reset-password`, `admin-export`: تأكيد `has_role(admin)` من الـ JWT داخل الـ function نفسها (مش بس RLS).
2. `detect-queue-alerts`, `send-reminder`, `enqueue-winback`: تأكد إنها service-role only + secret header.
3. `pg_cron` jobs: تأكد إنها بتستخدم vault secret وليس anon key مكشوف.
4. Response body: مفيش field حساس بيتسرّب (مثلاً bank_account في admin-export).

---

## Phase 4 — UI Alignment + Tests

1. **UI = مرآة لـ DB**: إخفاء الأزرار اللي DB هترفضها (UX فقط، مش أمن).
   - `Sidebar.tsx`, `AppShell`, `SettingsLayout.tsx`, `RowActions.tsx`, `exportGuard.ts`.
   - Field masking في `StaffDetail`, `Payroll`, `PatientFinancialCard`.
2. **Route guards**: كل route حساس يبقى فيه `adminOnly` أو `requirePermission("module","action")` صريح.
3. **Tests** (`tests/playwright/rbac.spec.ts` + جديد `rbac.deep.spec.ts`):
   - لكل دور من الـ 7: allow-list + deny-list متخصصة.
   - Deny يتحقق **من HTTP response (403/RLS error)** مش بس من إخفاء الزرار.
   - Field masking assertions (مثلاً receptionist ما يشوفش salary في response).
   - Edge function tests بـ JWT لدور مش admin → 403.
4. **RBAC_MATRIX.md** يتحدّث ليطابق الواقع الجديد بالظبط.

---

## Deliverables per Phase

| Phase | Files | Reviewable Output |
|---|---|---|
| 1 | `docs/RBAC_AUDIT.md`, `docs/RBAC_MATRIX.md` | تقرير gaps + matrix نهائي — **للموافقة قبل الكود** |
| 2 | migration واحد كبير | RLS + views + column grants + audit triggers |
| 3 | edge functions + migration للـ cron | كل function فيها role check |
| 4 | UI files + tests | Playwright tests خضراء لكل دور |

---

## أسئلة قبل ما أبدأ Phase 1

عشان ما اتخذش قرارات نيابة عنك في نقاط حساسة:

1. **HR ومرتبات**: مين له حق يشوف الـ salary/bank_account غير admin و hr؟ (manager بتاع الفرع؟ الموظف نفسه؟ ولا لأ خالص؟)
2. **Doctor commissions**: الدكتور نفسه يشوف عمولاته؟ ولا accountant + admin بس؟
3. **Wallet balances**: receptionist يشوف رصيد محفظة المريض؟ ولا accountant بس؟
4. **Patient medical history**: nurse يقدر يشوف كل الـ history ولا الزيارة الحالية بس؟
5. **Cross-branch visibility**: manager بيشوف فرعه بس (مؤكد)، لكن accountant بيشوف كل الفروع ولا فرعه بس؟
6. **Audit logs viewer**: admin بس؟ ولا manager كمان لفرعه؟

جاوب على دول وأبدأ Phase 1 على طول (تقرير + matrix للمراجعة قبل أي كود).
