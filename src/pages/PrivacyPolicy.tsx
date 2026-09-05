import { Link } from "react-router-dom";
import { Globe2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";

export default function PrivacyPolicy() {
  const { lang, setLang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10 flex items-start justify-between gap-4 border-b pb-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-primary"><ShieldCheck className="size-5" /><span className="font-semibold">ZMedico</span></div>
            <h1 className="text-3xl font-bold">{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{isAr ? "آخر تحديث: سبتمبر 2026" : "Last updated: September 2026"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLang(isAr ? "en" : "ar")}><Globe2 className="me-2 size-4" />{isAr ? "English" : "العربية"}</Button>
        </header>

        {isAr ? <ArabicContent /> : <EnglishContent />}

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-4"><Link className="hover:underline" to="/terms-of-service">{isAr ? "شروط الاستخدام" : "Terms of Service"}</Link><Link className="hover:underline" to="/data-deletion">{isAr ? "طلب حذف البيانات" : "Data Deletion"}</Link><Link className="hover:underline" to="/trust">{isAr ? "الأمان والخصوصية" : "Security & Privacy"}</Link><Link className="hover:underline" to="/">{isAr ? "العودة إلى ZMedico" : "Back to ZMedico"}</Link></div>
        </footer>
      </div>
    </div>
  );
}

function ArabicContent() {
  return <div className="space-y-8 leading-7">
    <Section title="1. نطاق السياسة"><p>توضح هذه السياسة كيفية تعامل ZMedico مع المعلومات التي يتم جمعها أو معالجتها عند استخدام منصة إدارة العيادات وخدمات التواصل المرتبطة بها.</p></Section>
    <Section title="2. المعلومات التي قد تتم معالجتها"><p>قد تشمل البيانات بيانات الحساب والموظفين، بيانات العيادة والفروع، بيانات المرضى ومواعيدهم، بيانات الفواتير والمدفوعات والسجلات الطبية التي تدخلها العيادة، وبيانات التواصل مثل أرقام الهواتف والرسائل الواردة عبر القنوات التي تربطها العيادة بالمنصة.</p><p>قد تتضمن البيانات أيضًا معلومات تقنية مثل عنوان IP، نوع الجهاز، سجلات الأخطاء، وأحداث الاستخدام اللازمة للأمان والتشغيل.</p></Section>
    <Section title="3. كيف نستخدم البيانات"><ul className="list-disc space-y-2 ps-6"><li>تقديم وتشغيل وإدارة خدمات ZMedico.</li><li>إدارة الحسابات والصلاحيات والفروع والمواعيد وعمليات العيادة.</li><li>تشغيل خدمات التواصل المتكاملة، بما في ذلك WhatsApp وInstagram وMessenger عندما تقوم العيادة بربطها.</li><li>تحسين الأمان، منع إساءة الاستخدام، واكتشاف الأخطاء والمشكلات التقنية.</li><li>تقديم ميزات الأتمتة والذكاء الاصطناعي عندما يتم تفعيلها من قبل العيادة.</li><li>الامتثال للالتزامات القانونية والاستجابة للطلبات المشروعة.</li></ul></Section>
    <Section title="4. القنوات التابعة لجهات خارجية"><p>عند ربط العيادة بخدمات Meta أو غيرها من مزودي القنوات، قد تتم معالجة الرسائل وبيانات الحساب وفقًا لإعدادات العيادة وسياسات مزود الخدمة المعني. لا تستخدم ZMedico هذه القنوات للوصول إلى بيانات خارج النطاق الذي تسمح به العيادة أو التكامل.</p></Section>
    <Section title="5. الذكاء الاصطناعي"><p>قد توفر ZMedico ميزات تعتمد على الذكاء الاصطناعي للرد على الاستفسارات، التأهيل، والمساعدة في إجراءات الحجز أو التواصل. عند تفعيل هذه الميزات، تتم معالجة المعلومات اللازمة لتنفيذ الطلب وفق إعدادات العيادة. يجب ألا يُفهم أي رد آلي على أنه تشخيص طبي أو بديل عن قرار المختص.</p></Section>
    <Section title="6. العزل والصلاحيات"><p>تم تصميم المنصة لدعم تعدد العيادات والفروع مع فصل بيانات المستأجرين والصلاحيات. الوصول إلى بيانات المرضى والموظفين والعمليات يقتصر على المستخدمين المصرح لهم وفق أدوارهم وإعدادات العيادة.</p></Section>
    <Section title="7. الاحتفاظ بالبيانات والحذف"><p>تحتفظ ZMedico بالبيانات للمدة اللازمة لتقديم الخدمة، الأمان، المتطلبات التشغيلية، أو الالتزامات القانونية. يمكن لصاحب الحساب أو الجهة المخولة طلب حذف البيانات وفق آلية حذف البيانات الموضحة في صفحة <Link className="underline" to="/data-deletion">حذف البيانات</Link>، مع مراعاة البيانات التي يلزم الاحتفاظ بها قانونًا.</p></Section>
    <Section title="8. حماية البيانات"><p>نستخدم ضوابط وصول وصلاحيات، حماية على مستوى الصفوف في قاعدة البيانات حيثما ينطبق، تخزينًا خاصًا للملفات الحساسة، وروابط مؤقتة للملفات الخاصة، بالإضافة إلى سجلات تدقيق ومراقبة للأحداث المهمة. لا توجد وسيلة نقل أو تخزين إلكترونية يمكن ضمان أنها آمنة بنسبة 100%.</p></Section>
    <Section title="9. مسؤولية العيادة"><p>العيادة هي المسؤولة عن مشروعية جمع بيانات مرضاها، صحة البيانات، تحديد من يملك صلاحية الوصول إليها، إعداد مدد الاحتفاظ، والحصول على الموافقات اللازمة وفق القوانين المطبقة عليها.</p></Section>
    <Section title="10. حقوق أصحاب البيانات"><p>بحسب القانون المطبق، قد يحق لصاحب البيانات طلب الوصول إلى بياناته أو تصحيحها أو حذفها أو تقييد معالجتها. تبدأ هذه الطلبات عادةً من خلال العيادة أو الجهة التي جمعت البيانات، ويمكن استخدام آلية طلب الحذف في المنصة عند الحاجة.</p></Section>
    <Section title="11. التغييرات على السياسة"><p>قد يتم تحديث هذه السياسة عند إضافة وظائف أو تكاملات جديدة أو عند تغير المتطلبات القانونية. سيتم نشر النسخة المحدثة على هذه الصفحة مع تاريخ آخر تحديث.</p></Section>
    <Section title="12. التواصل"><p>للاستفسارات المتعلقة بالخصوصية أو طلبات البيانات، تواصل مع مسؤول الخصوصية أو إدارة ZMedico من خلال وسيلة الاتصال الرسمية المعلنة في موقع الخدمة.</p></Section>
  </div>;
}

function EnglishContent() {
  return <div className="space-y-8 leading-7">
    <Section title="1. Scope"><p>This policy explains how ZMedico handles information collected or processed when you use the clinic-management platform and its connected communication services.</p></Section>
    <Section title="2. Information We May Process"><p>Information may include account and staff details, clinic and branch data, patient and appointment data, billing and payment information and medical records entered by a clinic, and communication data such as phone numbers and messages received through channels connected by the clinic.</p><p>We may also process technical information such as IP address, device type, error logs, and usage events needed for security and operation.</p></Section>
    <Section title="3. How We Use Information"><ul className="list-disc space-y-2 ps-6"><li>Provide, operate, and administer ZMedico services.</li><li>Manage accounts, permissions, branches, appointments, and clinic operations.</li><li>Operate connected communication services, including WhatsApp, Instagram, and Messenger when a clinic connects them.</li><li>Maintain security, prevent abuse, and diagnose technical problems.</li><li>Provide automation and AI features when enabled by the clinic.</li><li>Comply with legal obligations and respond to lawful requests.</li></ul></Section>
    <Section title="4. Third-Party Channels"><p>When a clinic connects Meta or other third-party communication services, messages and account information may be processed according to the clinic's configuration and the applicable provider policies. ZMedico does not use these integrations to access information beyond the scope authorized by the clinic and the integration.</p></Section>
    <Section title="5. Artificial Intelligence"><p>ZMedico may provide AI-powered features for answering inquiries, qualification, and assistance with booking or communication workflows. When enabled, the information necessary to perform the requested task may be processed. Automated responses must not be treated as medical diagnosis or a substitute for a qualified professional's judgment.</p></Section>
    <Section title="6. Isolation and Access Controls"><p>The platform is designed to support multiple clinics and branches with tenant and permission isolation. Access to patient, staff, and operational data is limited to authorized users according to their roles and clinic configuration.</p></Section>
    <Section title="7. Retention and Deletion"><p>ZMedico retains information for as long as necessary to provide the service, maintain security, meet operational requirements, or comply with legal obligations. Account owners or authorized parties may request deletion through the <Link className="underline" to="/data-deletion">Data Deletion</Link> process, subject to information that must legally be retained.</p></Section>
    <Section title="8. Data Security"><p>We use access controls and permissions, row-level database controls where applicable, private storage for sensitive files, temporary access links for private files, and audit and event monitoring. No electronic transmission or storage method can be guaranteed to be completely secure.</p></Section>
    <Section title="9. Clinic Responsibilities"><p>The clinic is responsible for the lawful collection of patient information, data accuracy, deciding who may access information, setting retention practices, and obtaining required notices or consents under applicable law.</p></Section>
    <Section title="10. Data Subject Rights"><p>Depending on applicable law, individuals may have rights to access, correct, delete, or restrict processing of their information. Such requests will generally be handled through the clinic or organization that collected the information, and the platform's deletion process may be used where appropriate.</p></Section>
    <Section title="11. Changes to This Policy"><p>We may update this policy when functionality, integrations, or legal requirements change. The current version will be published on this page with its latest update date.</p></Section>
    <Section title="12. Contact"><p>For privacy questions or data requests, contact the ZMedico privacy or administration team through the official contact method published on the service website.</p></Section>
  </div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="text-xl font-semibold">{title}</h2><div className="space-y-3 text-muted-foreground">{children}</div></section>;
}
