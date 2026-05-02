import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Check, X, Sparkles } from "lucide-react";

type Plan = {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_branches: number;
  max_staff: number;
  max_patients: number;
  max_invoices_monthly: number;
  features: Record<string, boolean>;
  is_popular: boolean;
  display_order: number;
};

const FEATURE_KEYS: Array<{ key: string; en: string; ar: string }> = [
  { key: "dashboard", en: "Dashboard & analytics", ar: "لوحة التحكم والتحليلات" },
  { key: "patients", en: "Patient management", ar: "إدارة المرضى" },
  { key: "appointments", en: "Appointments & calendar", ar: "المواعيد والتقويم" },
  { key: "invoices", en: "Invoicing & payments", ar: "الفواتير والمدفوعات" },
  { key: "inventory", en: "Inventory & purchase orders", ar: "المخزون وأوامر الشراء" },
  { key: "hr", en: "HR & attendance", ar: "الموارد البشرية والحضور" },
  { key: "reports", en: "Advanced reports", ar: "التقارير المتقدمة" },
  { key: "whatsapp", en: "WhatsApp / SMS reminders", ar: "تذكيرات واتساب / SMS" },
  { key: "api", en: "API access", ar: "الوصول إلى API" },
  { key: "priority_support", en: "Priority support", ar: "دعم ذو أولوية" },
];

export default function Pricing() {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [yearly, setYearly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      setPlans((data as any) || []);
      setLoading(false);
    })();
  }, []);

  const yearlyDiscountPct = (p: Plan) => {
    const full = p.price_monthly * 12;
    if (full <= 0) return 0;
    return Math.round(((full - p.price_yearly) / full) * 100);
  };

  const formatNum = (n: number) =>
    n >= 999 ? (isAr ? "غير محدود" : "Unlimited") : n.toLocaleString();

  return (
    <div dir={dir} className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <Link to="/" className="text-xl font-bold text-primary">ZMedico</Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/auth">{isAr ? "تسجيل الدخول" : "Sign in"}</Link></Button>
            <Button asChild><Link to="/auth">{isAr ? "ابدأ مجاناً" : "Start free"}</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 text-center">
        <Badge variant="secondary" className="mb-4">
          <Sparkles className="me-1 h-3 w-3" />
          {isAr ? "تجربة مجانية 14 يوماً" : "14-day free trial"}
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          {isAr ? "خطط تناسب كل عيادة" : "Pricing for every clinic"}
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
          {isAr
            ? "اختر الخطة المناسبة لحجم عيادتك. يمكنك الترقية أو التخفيض في أي وقت."
            : "Pick the plan that fits your clinic. Upgrade or downgrade anytime."}
        </p>

        <div className="inline-flex items-center gap-3 rounded-full border bg-card px-4 py-2">
          <span className={!yearly ? "font-semibold" : "text-muted-foreground"}>
            {isAr ? "شهري" : "Monthly"}
          </span>
          <Switch checked={yearly} onCheckedChange={setYearly} />
          <span className={yearly ? "font-semibold" : "text-muted-foreground"}>
            {isAr ? "سنوي" : "Yearly"}
          </span>
          <Badge variant="outline">{isAr ? "وفر حتى 17%" : "Save up to 17%"}</Badge>
        </div>
      </section>

      {/* Plans */}
      <section className="container mx-auto px-4 pb-16">
        {loading ? (
          <div className="text-center text-muted-foreground py-12">Loading…</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {plans.map((p) => {
              const price = yearly ? p.price_yearly / 12 : p.price_monthly;
              const totalNow = yearly ? p.price_yearly : p.price_monthly;
              return (
                <Card
                  key={p.id}
                  className={
                    "relative flex flex-col " +
                    (p.is_popular ? "border-primary shadow-lg ring-1 ring-primary/30" : "")
                  }
                >
                  {p.is_popular && (
                    <Badge className="absolute -top-3 start-1/2 -translate-x-1/2">
                      {isAr ? "الأكثر شيوعاً" : "Most popular"}
                    </Badge>
                  )}
                  <CardHeader>
                    <CardTitle className="text-2xl">{isAr ? p.name_ar : p.name_en}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {isAr ? p.description_ar : p.description_en}
                    </p>
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="text-4xl font-bold">{Math.round(price).toLocaleString()}</span>
                      <span className="text-muted-foreground">{p.currency}</span>
                      <span className="text-sm text-muted-foreground">
                        / {isAr ? "شهر" : "mo"}
                      </span>
                    </div>
                    {yearly && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {isAr
                          ? `يُحاسب سنوياً (${totalNow.toLocaleString()} ${p.currency}) — وفر ${yearlyDiscountPct(p)}%`
                          : `Billed yearly (${totalNow.toLocaleString()} ${p.currency}) — save ${yearlyDiscountPct(p)}%`}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-2 text-sm mb-6">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        {isAr ? `${formatNum(p.max_branches)} فرع` : `${formatNum(p.max_branches)} branches`}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        {isAr ? `${formatNum(p.max_staff)} موظف` : `${formatNum(p.max_staff)} staff`}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        {isAr ? `${formatNum(p.max_patients)} مريض` : `${formatNum(p.max_patients)} patients`}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        {isAr
                          ? `${formatNum(p.max_invoices_monthly)} فاتورة / شهر`
                          : `${formatNum(p.max_invoices_monthly)} invoices / mo`}
                      </li>
                      <li className="border-t pt-2 mt-2" />
                      {FEATURE_KEYS.map((f) => {
                        const on = !!p.features?.[f.key];
                        return (
                          <li key={f.key} className="flex items-center gap-2">
                            {on ? (
                              <Check className="h-4 w-4 text-primary" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/50" />
                            )}
                            <span className={on ? "" : "text-muted-foreground/70 line-through"}>
                              {isAr ? f.ar : f.en}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <Button asChild className="w-full mt-auto" variant={p.is_popular ? "default" : "outline"}>
                      <Link to={`/auth?plan=${p.id}`}>
                        {isAr ? "ابدأ التجربة المجانية" : "Start free trial"}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Comparison table */}
      <section className="container mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-6">
          {isAr ? "مقارنة الخطط" : "Compare plans"}
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-3">{isAr ? "الميزة" : "Feature"}</th>
                {plans.map((p) => (
                  <th key={p.id} className="p-3 text-center">{isAr ? p.name_ar : p.name_en}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_KEYS.map((f) => (
                <tr key={f.key} className="border-t">
                  <td className="p-3">{isAr ? f.ar : f.en}</td>
                  {plans.map((p) => (
                    <td key={p.id} className="p-3 text-center">
                      {p.features?.[f.key] ? (
                        <Check className="h-4 w-4 text-primary inline" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/40 inline" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-4 pb-20 max-w-3xl">
        <h2 className="text-2xl font-bold text-center mb-6">
          {isAr ? "الأسئلة الشائعة" : "Frequently asked questions"}
        </h2>
        <div className="space-y-4">
          {[
            {
              q: isAr ? "هل أحتاج بطاقة ائتمان للتجربة؟" : "Do I need a credit card for the trial?",
              a: isAr ? "لا، تبدأ التجربة فوراً بدون أي بيانات دفع." : "No. Start your trial instantly without any payment details.",
            },
            {
              q: isAr ? "هل يمكنني تغيير خطتي لاحقاً؟" : "Can I change plans later?",
              a: isAr ? "نعم، يمكنك الترقية أو التخفيض في أي وقت من لوحة الفوترة." : "Yes, upgrade or downgrade anytime from the billing dashboard.",
            },
            {
              q: isAr ? "ما طرق الدفع المدعومة؟" : "Which payment methods do you support?",
              a: isAr ? "ندعم البطاقات وفوري والمحافظ الإلكترونية عبر Paymob، بالإضافة إلى التحويل البنكي." : "Cards, Fawry, and e-wallets via Paymob, plus bank transfer.",
            },
            {
              q: isAr ? "هل بياناتي آمنة؟" : "Is my data secure?",
              a: isAr ? "جميع البيانات مشفرة، مع نسخ احتياطي يومي وعزل لكل عيادة." : "All data is encrypted, backed up daily, and isolated per clinic.",
            },
          ].map((item, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <p className="font-semibold mb-1">{item.q}</p>
                <p className="text-sm text-muted-foreground">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ZMedico
      </footer>
    </div>
  );
}