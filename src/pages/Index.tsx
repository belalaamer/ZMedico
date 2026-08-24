import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck2, ChartNoAxesCombined, CheckCircle2, ClipboardList, Globe2, Menu, ShieldCheck, Stethoscope, UsersRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";

type PublicPlan = {
  id: string;
  name_ar: string;
  name_en: string;
  price_monthly: number;
  currency: string;
  is_popular: boolean;
};

const features = [
  { icon: UsersRound, en: "Patient records that stay organized", ar: "ملفات مرضى منظمة وسهلة المتابعة" },
  { icon: CalendarCheck2, en: "Appointments, queue, and patient flow", ar: "المواعيد والـQueue ورحلة المريض" },
  { icon: ClipboardList, en: "Invoices, payments, and clinic operations", ar: "الفواتير والمدفوعات وتشغيل العيادة" },
  { icon: ChartNoAxesCombined, en: "Reports that help you make decisions", ar: "تقارير تساعدك على اتخاذ القرار" },
];

const steps = [
  { number: "01", en: "Choose a plan", ar: "اختر الخطة" },
  { number: "02", en: "Send your clinic details", ar: "أرسل بيانات عيادتك" },
  { number: "03", en: "We activate your workspace", ar: "نفعّل مساحة عيادتك" },
];

export default function Index() {
  const { lang, setLang } = useI18n();
  const isAr = lang === "ar";
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("subscription_plans")
      .select("id,name_ar,name_en,price_monthly,currency,is_popular")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => {
        if (!cancelled) setPlans((data ?? []) as PublicPlan[]);
      });
    return () => { cancelled = true; };
  }, []);

  const navItems = [
    { href: "#features", label: isAr ? "المزايا" : "Features" },
    { href: "#how-it-works", label: isAr ? "كيف تعمل" : "How it works" },
    { href: "/pricing", label: isAr ? "الأسعار" : "Pricing" },
  ];

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-bold text-primary">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Stethoscope className="size-5" /></span>
            <span>ZMedico</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {navItems.map((item) => item.href.startsWith("#") ? <a key={item.href} href={item.href} className="hover:text-foreground">{item.label}</a> : <Link key={item.href} to={item.href} className="hover:text-foreground">{item.label}</Link>)}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Button variant="ghost" size="sm" onClick={() => setLang(isAr ? "en" : "ar")}><Globe2 className="me-2 size-4" />{isAr ? "English" : "العربية"}</Button>
            <Button asChild variant="ghost" size="sm"><Link to="/auth">{isAr ? "تسجيل الدخول" : "Sign in"}</Link></Button>
            <Button asChild size="sm"><Link to="/request-trial">{isAr ? "ابدأ تجربتك" : "Start your trial"}</Link></Button>
          </div>
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label={isAr ? "فتح القائمة" : "Open menu"} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}</Button>
        </div>
        {menuOpen ? <div className="border-t px-4 py-4 sm:hidden"><div className="flex flex-col gap-3 text-sm"><a href="#features" onClick={() => setMenuOpen(false)}>{isAr ? "المزايا" : "Features"}</a><a href="#how-it-works" onClick={() => setMenuOpen(false)}>{isAr ? "كيف تعمل" : "How it works"}</a><Link to="/pricing" onClick={() => setMenuOpen(false)}>{isAr ? "الأسعار" : "Pricing"}</Link><div className="flex gap-2 pt-2"><Button variant="outline" size="sm" onClick={() => setLang(isAr ? "en" : "ar")}><Globe2 className="me-2 size-4" />{isAr ? "English" : "العربية"}</Button><Button asChild size="sm"><Link to="/request-trial">{isAr ? "ابدأ تجربتك" : "Start your trial"}</Link></Button></div></div></div> : null}
      </header>

      <main>
        <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-accent/10">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-28">
            <div className="max-w-2xl">
              <Badge variant="secondary" className="mb-5"><ShieldCheck className="me-1 size-3.5" />{isAr ? "مصمم للعيادات والمراكز الطبية" : "Built for clinics and medical centers"}</Badge>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{isAr ? "شغّل عيادتك بثقة، من الحجز إلى المتابعة." : "Run your clinic with confidence, from booking to follow-up."}</h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{isAr ? "ZMedico يجمع المرضى والمواعيد والـPatient Flow والفواتير والتقارير في مساحة واحدة، مع إمكانية إدارة أكثر من فرع." : "ZMedico brings patients, appointments, patient flow, billing, and reports into one workspace, with support for multiple branches."}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg"><Link to="/request-trial">{isAr ? "اطلب تجربة مجانية" : "Request a free trial"}<ArrowRight className="ms-2 size-4" /></Link></Button>
                <Button asChild variant="outline" size="lg"><Link to="/pricing">{isAr ? "شاهد الخطط والأسعار" : "See plans and pricing"}</Link></Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{isAr ? "لا يوجد دفع إلكتروني حاليًا. أرسل طلبك وسيتواصل معك فريق ZMedico لتفعيل العيادة يدويًا." : "Online payment is not enabled yet. Send a request and the ZMedico team will contact you to activate your clinic manually."}</p>
            </div>
            <div className="relative">
              <Card className="border-primary/20 bg-card/90 shadow-2xl">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center justify-between border-b pb-5"><div><p className="text-sm text-muted-foreground">{isAr ? "نظرة سريعة" : "A quick look"}</p><h2 className="mt-1 text-xl font-bold">{isAr ? "رحلة المريض اليوم" : "Today’s patient journey"}</h2></div><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarCheck2 className="size-6" /></div></div>
                  <div className="space-y-4 pt-6">{[isAr ? "موعد مؤكد" : "Confirmed appointment", isAr ? "تسجيل وصول من الـQueue" : "Check-in from the queue", isAr ? "جلسة قيد التنفيذ" : "Session in progress"].map((label, index) => <div key={label} className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"><CheckCircle2 className="size-4" /></div><div className="flex-1"><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${[100, 72, 44][index]}%` }} /></div><p className="mt-2 text-sm font-medium">{label}</p></div></div>)}</div>
                  <div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/60 p-4"><p className="text-2xl font-bold">{isAr ? "كل يوم" : "Every day"}</p><p className="mt-1 text-xs text-muted-foreground">{isAr ? "تشغيل واضح" : "Clear operations"}</p></div><div className="rounded-xl bg-primary p-4 text-primary-foreground"><p className="text-2xl font-bold">{isAr ? "كل فرع" : "Every branch"}</p><p className="mt-1 text-xs text-primary-foreground/75">{isAr ? "بيانات معزولة" : "Isolated data"}</p></div></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="max-w-2xl"><p className="text-sm font-semibold text-primary">{isAr ? "كل ما تحتاجه" : "Everything you need"}</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{isAr ? "نظام واحد بدل أدوات متفرقة" : "One system instead of scattered tools"}</h2></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(({ icon: Icon, en, ar }) => <Card key={en}><CardContent className="p-6"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></div><h3 className="mt-5 font-semibold">{isAr ? ar : en}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{isAr ? "وصول واضح للمعلومات والإجراءات اليومية بدون تعقيد." : "Keep the information and daily actions clear without unnecessary complexity."}</p></CardContent></Card>)}</div></section>

        <section id="how-it-works" className="border-y bg-muted/30"><div className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-end"><div><p className="text-sm font-semibold text-primary">{isAr ? "ابدأ بسهولة" : "Start simply"}</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{isAr ? "تجربة بدون دفع إلكتروني في الوقت الحالي" : "A guided trial while online payments are being prepared"}</h2><p className="mt-4 leading-7 text-muted-foreground">{isAr ? "نحن لا ننشئ حسابًا تلقائيًا من نموذج عام. ترسل بيانات العيادة، يراجعها System Owner، ثم يتم تفعيل مساحة العمل وإرسال بيانات الدخول بطريقة آمنة." : "We do not create accounts automatically from a public form. You send your clinic details, the System Owner reviews them, then activates the workspace and sends access securely."}</p></div><div className="grid gap-4 sm:grid-cols-3">{steps.map((step) => <div key={step.number} className="border-s-2 border-primary/40 ps-4"><p className="text-sm font-bold text-primary">{step.number}</p><p className="mt-2 font-semibold">{isAr ? step.ar : step.en}</p></div>)}</div></div></div></section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="rounded-3xl bg-primary px-6 py-12 text-primary-foreground sm:px-12"><div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-bold">{isAr ? "هل أنت مستعد لتجربة ZMedico؟" : "Ready to try ZMedico?"}</h2><p className="mt-3 max-w-xl text-primary-foreground/75">{isAr ? "اختر الخطة المناسبة وأرسل طلبك. لا تحتاج إلى بطاقة ائتمان أو دفع عبر الموقع الآن." : "Choose a plan and send your request. No credit card or online payment is required right now."}</p></div><Button asChild size="lg" variant="secondary"><Link to="/request-trial">{isAr ? "ابدأ طلب التجربة" : "Start trial request"}<ArrowRight className="ms-2 size-4" /></Link></Button></div></div></section>

        {plans.length > 0 ? <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-primary">{isAr ? "الخطط" : "Plans"}</p><h2 className="mt-1 text-2xl font-bold">{isAr ? "اختر ما يناسب حجم عيادتك" : "Choose the right fit for your clinic"}</h2></div><Link to="/pricing" className="text-sm font-semibold text-primary hover:underline">{isAr ? "مقارنة كاملة" : "Full comparison"}</Link></div><div className="grid gap-4 md:grid-cols-3">{plans.slice(0, 3).map((plan) => <Card key={plan.id} className={plan.is_popular ? "border-primary ring-1 ring-primary/20" : ""}><CardContent className="p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">{isAr ? plan.name_ar : plan.name_en}</h3>{plan.is_popular ? <Badge>{isAr ? "الأكثر شيوعًا" : "Popular"}</Badge> : null}</div><p className="mt-4 text-2xl font-bold">{Number(plan.price_monthly).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{plan.currency} / {isAr ? "شهر" : "month"}</span></p></CardContent></Card>)}</div></section> : null}
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} ZMedico</footer>
    </div>
  );
}
