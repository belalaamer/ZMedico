# اختبار عزل العيادات عبر RLS

الاختبار `rls.tenant-isolation.spec.ts` يقرأ من PostgREST باستخدام جلستين مستقلتين، واحدة لكل Tenant، ويتحقق من أن كل جلسة ترى فرعها فقط ولا تستطيع استهداف marker patient الخاص بالعيادة الأخرى.

الاختبار **read-only**: لا ينشئ ولا يعدل ولا يحذف صفوفًا. يجب تشغيله على مشروع QA أو على fixtures معتمدة لا تحتوي مرضى حقيقيين.

## المتطلبات

اضبط المتغيرات التالية في بيئة CI/QA السرية، وليس في ملفات المستودع:

```text
BASE_SUPABASE_URL
BASE_SUPABASE_ANON_KEY
RLS_TENANT_A_EMAIL
RLS_TENANT_A_PASS
RLS_TENANT_A_BRANCH_ID
RLS_TENANT_A_MARKER_PATIENT_ID
RLS_TENANT_B_EMAIL
RLS_TENANT_B_PASS
RLS_TENANT_B_BRANCH_ID
RLS_TENANT_B_MARKER_PATIENT_ID
```

لا تضع قيم كلمات المرور أو access tokens في test report أو logs. الاختبار يتخطى نفسه بأمان إذا لم تكتمل المتغيرات.

## التشغيل

```bash
npx playwright test --project=rls-tenant-isolation
```

## شروط نجاح الاختبار

يجب أن ينجح مستخدم Tenant A في قراءة marker A فقط، وأن تكون كل صفوف `patients` المرئية له مرتبطة بفرع A. ويجب أن ينجح مستخدم Tenant B في قراءة marker B فقط، وأن تكون صفوفه مرتبطة بفرع B. أي صف foreign marker مرئي أو أي branch_id خارج الفرع المتوقع يعتبر فشل عزل.

يظل اختبار PostgREST مكملًا لاختبار pgTAP الموجود في `supabase/tests/rls_tenant_isolation.sql`؛ الأول يثبت السلوك بجلسات حقيقية، والثاني يراقب عدم حذف RLS أو restrictive branch policies أثناء migrations.
