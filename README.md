# ZMedico

نظام SaaS متعدد المستأجرين لإدارة العيادات والمراكز الطبية. يدعم النظام العيادات والفروع والأطباء والموظفين والمرضى والمواعيد والخدمات والإجراءات والسجلات الطبية والفواتير والخزينة والمخزون والتقارير والخطط والاشتراكات والحجز العام والـWhite Label وبوابات المرضى.

> **حالة مهمة:** هذا المشروع يتعامل مع بيانات سريرية ومالية حساسة. لا تستخدم بيانات إنتاج حقيقية في التطوير أو الاختبارات، ولا تعطل RLS لتجاوز خطأ مؤقت.

---

## المحتويات

- [المتطلبات](#المتطلبات)
- [الحصول على المشروع وتشغيله](#الحصول-على-المشروع-وتشغيله)
- [متغيرات البيئة](#متغيرات-البيئة)
- [أوامر التطوير والاختبار](#أوامر-التطوير-والاختبار)
- [بنية المشروع](#بنية-المشروع)
- [المعمارية متعددة المستأجرين](#المعمارية-متعددة-المستأجرين)
- [الأدوار والصلاحيات](#الأدوار-والصلاحيات)
- [قواعد Supabase وRLS](#قواعد-supabase وrls)
- [الحجز والموارد](#الحجز-والموارد)
- [الخطط والـEntitlements](#الخطط-والـentitlements)
- [العلامة البيضاء والنطاقات](#العلامة-البيضاء-والنطاقات)
- [سير عمل GitHub](#سير-عمل-github)
- [النشر على Cloudflare](#النشر-على-cloudflare)
- [الـMigrations](#الـmigrations)
- [اختبارات الهاتف وQA](#اختبارات-الهاتف وqa)
- [قائمة فحص Pull Request](#قائمة-فحص-pull-request)
- [المشكلات الشائعة](#المشكلات-الشائعة)
- [مراجع المطور](#مراجع-المطور)

---

## المتطلبات

| الأداة | الغرض | ملاحظة |
|---|---|---|
| Node.js | تشغيل Vite وTypeScript | استخدم إصدار LTS متوافقًا مع المشروع |
| pnpm | تثبيت الحزم وتشغيل scripts | لا تخلط بين npm وpnpm في نفس التغيير |
| Git | إدارة المصدر | اعمل على فرع خاص لكل ميزة |
| Playwright | اختبارات المتصفح | يحتاج متصفحات Playwright المثبتة |
| Supabase CLI | إدارة migrations عند الحاجة | لا تربط مشروع Production دون تصريح واضح |
| Wrangler | نشر Cloudflare Worker | لا تضع Token في الكود أو Git |

قبل البدء، تأكد من أن إصدارات Node وpnpm متوافقة مع `package.json` وملف lock الموجود في المستودع. لا تحذف lockfile أو تستبدله دون سبب موثق.

---

## الحصول على المشروع وتشغيله

استنسخ المستودع من GitHub، ثم انتقل إلى مجلد المشروع وثبّت الحزم:

```bash
git clone https://github.com/belalaamer/practice-pulse-8fd5e21c.git
cd practice-pulse-8fd5e21c
pnpm install
```

أنشئ ملف بيئة محليًا اعتمادًا على ملف المثال إن كان موجودًا:

```bash
cp .env.example .env.local
```

إذا لم يوجد ملف مثال، اطلب من مسؤول المشروع أسماء المتغيرات المطلوبة فقط. لا تطلب منه إرسال القيم السرية في المحادثة، ولا تضف `.env.local` إلى Git.

شغّل خادم التطوير:

```bash
pnpm dev
```

بعد بدء Vite، افتح الرابط المحلي الذي يظهر في الطرفية. لا تفترض أن المنفذ ثابت إذا كان مستخدمًا من خدمة أخرى.

---

## متغيرات البيئة

يجب أن تبقى المفاتيح السرية في بيئة التشغيل أو Secret Manager، وليس في React أو ملفات `src`.

| النوع | أمثلة على المتغيرات | مكان الاستخدام |
|---|---|---|
| Supabase العام | `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` | الواجهة؛ لا تمنح صلاحيات إدارية |
| Supabase الإداري | مفاتيح service role أو Management Token | Edge Functions أو أدوات إدارة محمية فقط |
| Cloudflare | `CLOUDFLARE_API_TOKEN` وAccount ID | Wrangler أو CI/CD فقط |
| WhatsApp | `WHATSAPP_VERIFY_TOKEN` و`WHATSAPP_APP_SECRET` | Edge Function أو Worker فقط |
| البريد | Secrets مزود البريد | Worker/Edge Function فقط |

لا تستخدم `service_role` أو Management Token في المتصفح. لا تسجل قيمة أي Secret في console أو CI logs. عند تدوير Token، حدّث Secret في المكان المناسب واختبر صلاحية القراءة ثم النشر.

---

## أوامر التطوير والاختبار

استخدم scripts المعرفة في `package.json` بدل تخمين أوامر جديدة. الأوامر الشائعة تكون عادةً بالشكل التالي:

```bash
pnpm dev
pnpm build
pnpm test
pnpm exec tsc --noEmit
pnpm exec playwright test
pnpm exec playwright test tests/playwright/public-mobile.spec.ts
pnpm exec playwright test --project=mobile-320
pnpm exec prettier --check .
git diff --check
```

قد تختلف بعض أسماء scripts حسب النسخة الحالية؛ افحص `pnpm run` أولًا. يجب أن يمر Production build وTypeScript والاختبارات المتأثرة قبل فتح Pull Request.

قبل كل اختبار، افصل بين الاختبارات التي تقرأ فقط والاختبارات التي تكتب أو تحذف. اختبارات الكتابة والحذف لا تعمل على Production.

---

## بنية المشروع

| المسار | المسؤولية |
|---|---|
| `src/` | كود الواجهة والمكونات والصفحات والـcontexts |
| `src/contexts/BranchContext.tsx` | تحديد tenant والفرع وسياق الاشتراك |
| `src/pages/` | صفحات التطبيق العامة والمحمية |
| `src/pages/booking/PublicBooking.tsx` | واجهة الحجز العامة |
| `src/pages/treasury/Treasury.tsx` | شاشة الخزينة |
| `src/pages/dashboard/Dashboard.tsx` | لوحة المؤشرات |
| `src/pages/pricing/Pricing.tsx` | الأسعار والخطط والمقارنة |
| `supabase/migrations/` | مصدر migrations الخاصة بقاعدة البيانات |
| `tests/` | اختبارات الوحدة والـPlaywright والـRLS |
| `.github/workflows/` | Workflows البناء والنشر والفحص |
| `dist/` | ناتج Production build؛ لا تعدله يدويًا |
| `public/` | الملفات العامة الثابتة |

اقرأ الصفحة والـcontext والـhooks المرتبطة بالميزة قبل تعديلها. لا تضف منطق صلاحيات داخل مكون عرض فقط؛ يجب أن تكون الحماية في قاعدة البيانات أو الـAPI ثم تنعكس على الواجهة.

---

## المعمارية متعددة المستأجرين

المصطلحات الأساسية هي:

| المصطلح | المعنى |
|---|---|
| Tenant / Workspace | العيادة أو العميل التجاري الذي يملك بياناته |
| Branch | فرع داخل Tenant |
| System Owner | مستخدم عالمي يدير المنصة والعملاء، وليس Clinic Admin |
| Clinic Admin | مدير داخل Tenant محدد |
| Staff | طبيب أو موظف مرتبط بTenant وفرع أو أكثر حسب الصلاحية |
| Platform Administration | مساحة الإدارة العالمية للعملاء والخطط والدومينات |
| Workspace context | سياق العيادة والفرع الذي تعمل داخله الواجهة |

كل query حساس يجب أن يكون محدودًا بالـTenant والفرع عند الحاجة. لا تعتمد على قيمة يرسلها المستخدم من الواجهة وحدها، ولا تعتبر إخفاء صف أو menu دليلًا على العزل. يجب أن تمنع RLS وRPC وطبقة الخادم الوصول غير المصرح به.

`BranchContext.tsx` هو محور مهم لتحميل tenant/branch scope وحالة الاشتراك. عند تغيير هذا الملف، اختبر حالات غياب `tenant_id` وفشل lookup وتأخر جلسة المصادقة؛ يجب ألا تظل الواجهة عالقة على `Checking subscription...`.

---

## الأدوار والصلاحيات

System Owner عالمي ويجب أن يدخل إلى Platform Administration. لا ينبغي أن يتم تحويله تلقائيًا إلى Workspace عشوائية أو أن تعرض له واجهة الفرع قبل اختيار السياق. عند فتح Workspace يجب أن يظهر اسم العيادة والفرع، ويجب توفير زر واضح للعودة إلى Platform Administration.

Clinic Admin يدير بيانات Tenant الخاص به فقط. الطبيب والموظف والاستقبال يحصلون على أقل صلاحية لازمة لأداء العمل. عند إضافة route أو عنصر sidebar جديد، راجع حارس الصفحة، صلاحية الدور، tenant scope، branch scope، وسياسة RLS المقابلة.

الإعدادات العامة للمنصة يجب فصلها عن إعدادات العيادة والفرع. لا تعرض Branches أو Branch Dashboard أو إعدادات العيادة في Platform Administration إلا كجزء من سياق Workspace صريح.

---

## قواعد Supabase وRLS

أي جدول يحتوي بيانات مرضى أو موظفين أو مواعيد أو فواتير أو خزينة أو مخزون يجب أن يمتلك سياسات RLS واضحة للقراءة والكتابة والتعديل والحذف. عند كتابة policy، تحقق من المستخدم الحالي ومن ارتباطه بالـTenant والفرع، ولا تستخدم `user_metadata` وحده كمصدر ثقة.

قبل تطبيق migration جديدة:

1. افحص Git status واسم migration.
2. تحقق من سجل migrations في مشروع Supabase الصحيح.
3. تأكد أن migration لم تطبق سابقًا.
4. راجع SQL بحثًا عن grants أو policies واسعة.
5. طبّقها مرة واحدة في بيئة QA أولًا إن أمكن.
6. اختبر القراءة والكتابة والحذف بجلسات مختلفة.

يجب تأمين دوال `SECURITY DEFINER` باستخدام `search_path` ثابت وآمن، والتحقق من صلاحية المستخدم داخل الدالة، ومنع `EXECUTE` العام للدوال الحساسة. لا تستخدم `SECURITY DEFINER` لتجاوز RLS بشكل عام.

اختبار العزل الصحيح يحتاج Tenant A وTenant B وهويتين مستقلتين. يجب التأكد من أن A لا يستطيع SELECT أو INSERT أو UPDATE أو DELETE على سجلات B، وأن Realtime لا يرسل أحداث A إلى B.

---

## الحجز والموارد

المريض يحجز **Service** قابلة للحجز. أما **Procedure** فتسجل داخل السجل الطبي بعد حضور المريض وتنفيذ الإجراء. عند تعديل الحجز، حافظ على هذا الفصل حتى لا تظهر الإجراءات غير القابلة للحجز في Public Booking.

يجب أن يعتمد توليد المواعيد على مدة الخدمة الفعلية، والفاصل أو الـbuffer، وساعات عمل الطبيب، والغرفة، والسعة المتزامنة. لا تستخدم interval ثابتًا مثل 45 دقيقة لكل الخدمات إلا إذا كان ذلك إعدادًا مقصودًا.

عند ربط Service بطبيب، يجب أن تظهر في خطوة اختيار الطبيب أسماء الأطباء الذين يقدمون الخدمة فقط. وعند ربطها بغرفة، يجب احترام سعة الغرفة ومنع التعارض. عند الإلغاء أو الرفض، حرر السعة تلقائيًا، وسجل سبب الرفض عند الحاجة، وأرسل الإشعار المناسب.

اختبر دائمًا Service → Doctor → Time → Details، ثم القبول والرفض والإلغاء وإعادة الجدولة، مع أكثر من فرع داخل Tenant واحد.

---

## الخطط والـEntitlements

الخطة تحدد الوحدات والمزايا والحدود والمدة. إخفاء زر أو route لا يكفي؛ يجب فرض الحدود في عمليات الإنشاء والتعديل على مستوى قاعدة البيانات أو الخادم أيضًا.

اختبر الخطط Basic وProfessional وEnterprise، وتحقق من الوحدات المفعلة، الحد الأقصى للفروع والموظفين والمرضى والفواتير، تاريخ البداية والنهاية، انتهاء الخطة، تغييرها، والتجديد اليدوي. يجب أن يكون سلوك المستخدم واضحًا عند انتهاء الاشتراك أو تعطيل وحدة.

لا تغيّر بيانات اشتراك Production أثناء الاختبار. استخدم بيانات QA أو اطلب تأكيدًا صريحًا قبل أي عملية إدارية حساسة.

---

## العلامة البيضاء والنطاقات

يدعم النظام اسم العيادة بالعربية والإنجليزية، والشعار، وFavicon، والألوان، وعبارة Powered by ZMedico. يجب تطبيق fallback بحيث لا يظهر اسم `ZMedico` إذا كان اسم العيادة متوفرًا بأي لغة.

اختبر Branding في Login وSidebar وPublic Booking واسم تبويب المتصفح والبريد. عند تعطيل Powered by يجب أن يختفي اسم وشعار ZMedico من المواضع المخصصة لذلك، وليس مجرد تغيير قيمة في الإعدادات.

Custom Domains وSubdomains تحتاج DNS وSSL/DCV وFallback Origin وتوجيه Worker صحيحًا. نطاق العميل يجب أن يفتح Login الخاص بWorkspace، لا Pricing أو Platform Administration. لا تعتبر `www` وroot متكافئين تلقائيًا؛ افحص redirect وDNS و522 وCustom Hostname بشكل مستقل.

---

## سير عمل GitHub

اعمل على فرع باسم واضح:

```bash
git checkout -b fix/short-description
```

بعد التعديل:

```bash
git status
git diff --check
pnpm build
pnpm test
git add <files>
git commit -m "Fix: short description"
git push -u origin fix/short-description
```

لا تضع Secrets في commit. راجع diff قبل push، وتأكد أن ملفات `.env*` أو logs أو screenshots الحساسة غير متتبعة. استخدم Pull Request مع وصف المشكلة، الحل، الاختبارات، وتأثير العزل والصلاحيات.

كانت هناك مشكلة سابقة في GitHub Actions حيث يفشل Job قبل بدء Runner، مع `runnerId: null` وبدون steps. إذا تكرر ذلك، لا تفترض أن الكود فشل؛ افحص حالة Job أولًا، ثم استخدم مسار Cloudflare المباشر المعتمد.

---

## النشر على Cloudflare

Worker الإنتاج اسمه `zmedico2`. يجب تنفيذ Production build قبل النشر، ثم رفع Worker وAssets كاملة. لا تستخدم `keep_assets` وحده عند تغير `index.html` أو ملفات JavaScript؛ فقد ينتج عدم توافق بين أسماء chunks الجديدة والقديمة.

النشر المباشر يتم عبر Wrangler بعد توفير Cloudflare API Token في البيئة:

```bash
pnpm build
CLOUDFLARE_ACCOUNT_ID=<account-id> pnpm exec wrangler deploy
```

يجب أن يملك Token صلاحية Workers Scripts: Edit على الحساب الصحيح، مع الصلاحيات الإضافية اللازمة فقط عند تعديل DNS أو Custom Hostnames. لا تضع Token في الأمر إذا كانت بيئة الطرفية تعرضه للمستخدم؛ استخدم Secret Manager أو متغيرًا موروثًا آمنًا.

بعد النشر، تحقق من:

```bash
curl -I https://zmedico2.belalaamer.workers.dev/
curl -I https://zmedico2.belalaamer.workers.dev/pricing
```

ثم افتح `/`, `/pricing`, `/auth` واختبر تحميل JavaScript والـconsole والـnetwork. لا تعلن نجاح النشر لمجرد أن Wrangler أنهى الأمر؛ تحقق من النسخة الحية.

---

## الـMigrations

ملفات migrations هي مصدر التغيير وتعيش في `supabase/migrations/`. أما Supabase فيحتوي على schema والسياسات والدوال وسجل migrations المطبقة. لا تعدّل Production يدويًا دون migration موثقة في Git.

اسم migration دعم أسماء العيادات بالعربية والإنجليزية هو:

`20260828100000_bilingual_tenant_names.sql`

قبل إضافة migration، استخدم اسمًا زمنيًا فريدًا، واكتب SQL قابلًا لإعادة المراجعة. تجنب حذف أعمدة أو بيانات مباشرة، وأضف اختبارات تحقق بعد التطبيق. لا تشغل migration نفسها مرة ثانية إذا كانت مطبقة.

---

## اختبارات الهاتف وQA

المقاسات الأساسية هي 320px و390px و430px. اختبر المسارات العامة والمسارات المحمية. ركز على Login، Pricing، Dashboard، Calendar، Patients، Treasury، Settings، Booking، Platform Console، وPatient Portal.

راقب أثناء الاختبار:

| الفئة | ما يجب التحقق منه |
|---|---|
| Layout | عدم وجود horizontal overflow أو عناصر مقطوعة |
| Navigation | فتح وغلق mobile menu والعودة الصحيحة |
| Auth | عدم إعادة المستخدم إلى Pricing بعد تسجيل الدخول |
| Data | عدم ظهور بيانات Tenant آخر |
| Loading | عدم بقاء شاشة subscription أو branch بلا نهاية |
| Errors | عدم وجود أخطاء console أو failed dynamic import |
| Accessibility | labels واضحة، أزرار قابلة للمس، contrast مناسب |
| Performance | حجم Assets، cache، وعدد الطلبات الأولية |

لا تستخدم حساب System Owner لاختبارات كتابة أو حذف على Production. اختبارات RLS الحقيقية تحتاج بيئة QA منفصلة ومتغيرات جلسات مستقلة.

---

## قائمة فحص Pull Request

قبل طلب المراجعة، اكتب إجابات واضحة عن البنود التالية:

- هل التغيير يؤثر على tenant أو branch scope؟
- هل توجد query جديدة تحتاج RLS أو policy؟
- هل تم اختبار System Owner وClinic Admin والأدوار المتأثرة؟
- هل تم اختبار 320px و390px و430px؟
- هل تم تشغيل TypeScript وbuild والاختبارات؟
- هل تم اختبار حالات loading وempty وerror؟
- هل توجد migration؟ وهل تحققت من عدم تطبيقها سابقًا؟
- هل يمكن أن يلمس التغيير بيانات سريرية أو مالية؟
- هل أضيفت Secrets أو ملفات بيئة بالخطأ؟
- هل يحتاج النشر إلى تغيير Cloudflare أو Supabase Secrets؟

---

## المشكلات الشائعة

### ظهور `treasury_transactions.branch_id does not exist`

لا تضف العمود تلقائيًا. افحص schema أولًا. في التصميم الحالي، يمر نطاق الفرع عبر `treasury_id` والجدول الأب. راجع `Treasury.tsx` و`Dashboard.tsx` وأزل أي filter خاطئ على `treasury_transactions.branch_id`.

### ظهور `permission denied for function ...`

راجع grants وRLS وSecurity Definer و`search_path` والدور الذي يستدعي الدالة. لا تمنح public execute كحل سريع.

### بقاء `Checking subscription...`

راجع `BranchContext.tsx` وجميع مسارات الفشل: غياب tenant، فشل lookup، انتهاء الجلسة، وغياب branch. كل مسار يجب أن ينهي loading state أو يعرض خطأ قابلًا للفهم.

### فتح Workspace على Pricing

افحص Auth guards وredirect logic وترتيب تحميل session وtenant. لا تستخدم redirect عام إلى `/pricing` عندما يكون المستخدم مصادقًا ولديه Workspace.

### فشل GitHub Actions قبل الخطوات

تحقق من `runnerId` و`steps`. إذا كانت فارغة، فالمشكلة في تخصيص Runner وليست في build. استخدم Wrangler المباشر بعد التأكد من Token.

### خطأ `401` أو `Authentication error [code: 10000]` من Cloudflare

تحقق من أن Token مرتبط بالحساب الصحيح ويملك Workers Scripts: Edit. لا تستخدم anon key أو Global API Key بلا داعٍ، ولا تطبع Token أثناء التشخيص.

### ظهور بيانات Workspace أخرى

اعتبرها ثغرة عزل حتى يثبت العكس. افحص query وRLS وRPC وRealtime وcontext، ولا تكتفِ بإخفاء العنصر من sidebar.

---

## مراجع المطور

للحالة التاريخية وقرارات المنتج، راجع ملف التسليم:

`/home/ubuntu/projects/zmedico-6e1a5948/ZMedico_HANDOFF_TO_NEXT_AI_AR.md`

ولتعليمات متابعة نموذج آخر:

`/home/ubuntu/projects/zmedico-6e1a5948/ZMedico_NEXT_AI_START_PROMPT_AR.md`

يجب اعتبار الكود وGitHub وSupabase وCloudflare مصادر مختلفة: GitHub يحفظ المصدر، Supabase يحفظ schema والبيانات والسياسات المطبقة، Cloudflare يشغل build منشورًا، ومجلد المشروع المشترك يحفظ التقارير والوثائق.

---

## مبدأ العمل النهائي

نفّذ أقل تغيير آمن يحقق المطلوب، اختبره في بيئة منفصلة، راجع أثره على tenant isolation والصلاحيات والهاتف، ثم انشره بعد تحقق حي. النظام لا يكون جاهزًا للبيع لمجرد أن الصفحة تفتح؛ الجاهزية تتطلب عزلًا مثبتًا، اختبارات أدوار، اختبارات حدود الاشتراك، حجزًا متكاملًا، ونشرًا يمكن التحقق منه.
