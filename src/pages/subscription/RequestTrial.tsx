import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Globe2, Loader2, ShieldCheck, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSubscriptionRequest, validateSubscriptionRequest } from "@/lib/subscriptionRequest";

type Plan = { id: string; name_ar: string; name_en: string; price_monthly: number; currency: string };
type RequestResult = { accepted?: boolean; code?: string };

export default function RequestTrial() {
  const { lang, setLang } = useI18n();
  const isAr = lang === "ar";
  const location = useLocation();
  const navigate = useNavigate();
  const initialPlan = useMemo(() => new URLSearchParams(location.search).get("plan") ?? "", [location.search]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState(initialPlan);
  const [clinicName, setClinicName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("subscription_plans")
      .select("id,name_ar,name_en,price_monthly,currency")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => {
        if (cancelled) return;
        const next = (data ?? []) as Plan[];
        setPlans(next);
        if (!planId && next[0]) setPlanId(next[0].id);
      });
    return () => { cancelled = true; };
  }, [planId]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const draft = { clinicName, ownerName, email, phone, planId, message };
    if (validateSubscriptionRequest(draft)) {
      setError(isAr ? "راجع اسم العيادة واسم المسؤول والبريد والبيانات الاختيارية." : "Please review the clinic name, owner name, email, and optional fields.");
      return;
    }
    setSaving(true);
    const { data, error: requestError } = await supabase.functions.invoke("public-subscription-request", {
      body: { payload: normalizeSubscriptionRequest(draft) },
    });
    setSaving(false);
    if (requestError) {
      setError(isAr ? "تعذر إرسال الطلب الآن. حاول مرة أخرى أو تواصل معنا مباشرة." : "We could not send your request. Please try again or contact us directly.");
      return;
    }
    const result = data as RequestResult | null;
    if ((result as any)?.code === "rate_limited") {
      setError(isAr ? "تم إرسال عدد كبير من الطلبات من هذا الاتصال. حاول مرة أخرى لاحقًا." : "Too many requests were sent from this connection. Please try again later.");
      return;
    }
    if (result?.code === "already_requested") {
      setError(isAr ? "تم استلام طلب من هذا البريد خلال آخر 24 ساعة. سنعاود التواصل معك." : "We already received a request from this email in the last 24 hours. We will contact you.");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return <div dir={isAr ? "rtl" : "ltr"} className="min-h-dvh bg-muted/30"><header className="border-b bg-background"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6"><Link to="/" className="flex items-center gap-2 font-bold text-primary"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Stethoscope className="size-5" /></span>ZMedico</Link><Button variant="ghost" size="sm" onClick={() => setLang(isAr ? "en" : "ar")}><Globe2 className="me-2 size-4" />{isAr ? "English" : "العربية"}</Button></div></header><main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12 sm:px-6"><Card className="w-full text-center"><CardContent className="space-y-5 p-8 sm:p-12"><div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-8" /></div><h1 className="text-3xl font-bold">{isAr ? "تم استلام طلبك" : "Your request is on its way"}</h1><p className="leading-7 text-muted-foreground">{isAr ? "سيراجع فريق ZMedico بيانات عيادتك ويتواصل معك لتحديد الخطة وتفعيل الحساب يدويًا. لا تحتاج إلى دفع أو بطاقة ائتمان الآن." : "The ZMedico team will review your clinic details and contact you to confirm the plan and activate access manually. No payment or credit card is needed right now."}</p><div className="flex flex-col gap-3 sm:flex-row sm:justify-center"><Button asChild><Link to="/pricing">{isAr ? "مراجعة الخطط" : "Review plans"}</Link></Button><Button variant="outline" onClick={() => navigate("/")}>{isAr ? "العودة للرئيسية" : "Back to home"}</Button></div></CardContent></Card></main></div>;
  }

  return <div dir={isAr ? "rtl" : "ltr"} className="min-h-dvh bg-muted/30"><header className="border-b bg-background"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6"><Link to="/" className="flex items-center gap-2 font-bold text-primary"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Stethoscope className="size-5" /></span>ZMedico</Link><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => setLang(isAr ? "en" : "ar")}><Globe2 className="me-2 size-4" />{isAr ? "English" : "العربية"}</Button><Button asChild variant="ghost" size="sm"><Link to="/auth">{isAr ? "تسجيل الدخول" : "Sign in"}</Link></Button></div></div></header><main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-start lg:py-16"><div className="space-y-5"><Badge variant="secondary"><ShieldCheck className="me-1 size-3.5" />{isAr ? "بدون بطاقة ائتمان" : "No credit card"}</Badge><h1 className="text-4xl font-bold leading-tight">{isAr ? "ابدأ تجربة عيادتك مع ZMedico" : "Start your clinic trial with ZMedico"}</h1><p className="leading-7 text-muted-foreground">{isAr ? "أرسل بيانات بسيطة عن عيادتك. يراجعها System Owner ثم يفعّل لك مساحة العمل والخطة المناسبة يدويًا." : "Share a few details about your clinic. The System Owner reviews them and manually activates the right workspace and plan."}</p><div className="space-y-3 text-sm text-muted-foreground"><div className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{isAr ? "لا يتم إنشاء حساب أو Tenant قبل المراجعة." : "No account or tenant is created before review."}</div><div className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{isAr ? "لا يتم طلب بيانات دفع من الموقع حاليًا." : "The website does not ask for payment details yet."}</div><div className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{isAr ? "سيتم التواصل معك لتحديد المدة والفروع والوحدات." : "We will confirm the term, branches, and modules with you."}</div></div></div><Card><CardHeader><CardTitle>{isAr ? "بيانات طلب التجربة" : "Trial request details"}</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="clinic-name">{isAr ? "اسم العيادة أو المركز" : "Clinic or center name"}</Label><Input id="clinic-name" value={clinicName} onChange={(event) => setClinicName(event.target.value)} required maxLength={120} /></div><div className="space-y-2"><Label htmlFor="owner-name">{isAr ? "اسم المسؤول" : "Owner or manager name"}</Label><Input id="owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required maxLength={120} /></div><div className="space-y-2"><Label htmlFor="request-email">{isAr ? "البريد الإلكتروني" : "Email"}</Label><Input id="request-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={255} /></div><div className="space-y-2"><Label htmlFor="request-phone">{isAr ? "رقم الهاتف (اختياري)" : "Phone (optional)"}</Label><Input id="request-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} dir="ltr" /></div></div><div className="space-y-2"><Label>{isAr ? "الخطة المفضلة" : "Preferred plan"}</Label><Select value={planId || "none"} onValueChange={(value) => setPlanId(value === "none" ? "" : value)}><SelectTrigger><SelectValue placeholder={isAr ? "اختر خطة" : "Choose a plan"} /></SelectTrigger><SelectContent><SelectItem value="none">{isAr ? "سأقرر مع الفريق" : "I will decide with the team"}</SelectItem>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en} · {Number(plan.price_monthly).toLocaleString()} {plan.currency}/{isAr ? "شهر" : "month"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="request-message">{isAr ? "ما الذي تحتاجه؟ (اختياري)" : "What do you need? (optional)"}</Label><Textarea id="request-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} rows={4} placeholder={isAr ? "مثال: مركز علاج طبيعي بفرعين" : "Example: a physiotherapy center with two branches"} /></div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button type="submit" className="w-full" size="lg" disabled={saving}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "إرسال طلب التجربة" : "Send trial request"}<ArrowRight className="ms-2 size-4" /></Button><p className="text-center text-xs leading-5 text-muted-foreground">{isAr ? "سنستخدم بياناتك للرد على طلب الاشتراك فقط. لن يتم إنشاء حساب تلقائيًا." : "We use these details only to respond to your subscription request. No account is created automatically."}</p></form></CardContent></Card></main><footer className="border-t py-8 text-center text-sm text-muted-foreground"><Link to="/pricing" className="inline-flex items-center gap-2 hover:text-foreground"><ArrowLeft className="size-4" />{isAr ? "العودة إلى الأسعار" : "Back to pricing"}</Link></footer></div>;
}
