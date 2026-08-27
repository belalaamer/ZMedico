import { useCallback, useEffect, useState } from "react";
import { Edit3, Loader2, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const FEATURE_KEYS = [
  { key: "dashboard", en: "Dashboard & analytics", ar: "لوحة التحكم والتحليلات" },
  { key: "patients", en: "Patient management", ar: "إدارة المرضى" },
  { key: "appointments", en: "Appointments & calendar", ar: "المواعيد والتقويم" },
  { key: "invoices", en: "Invoicing & payments", ar: "الفواتير والمدفوعات" },
  { key: "inventory", en: "Inventory & purchase orders", ar: "المخزون وأوامر الشراء" },
  { key: "hr", en: "HR & attendance", ar: "الموارد البشرية والحضور" },
  { key: "marketing", en: "Marketing & CRM", ar: "التسويق وCRM" },
  { key: "reports", en: "Advanced reports", ar: "التقارير المتقدمة" },
  { key: "whatsapp", en: "WhatsApp / SMS reminders", ar: "تذكيرات واتساب / SMS" },
  { key: "api", en: "API access", ar: "الوصول إلى API" },
  { key: "priority_support", en: "Priority support", ar: "دعم ذو أولوية" },
];

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
  is_active: boolean;
  display_order: number;
};

type FormState = {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  maxBranches: string;
  maxStaff: string;
  maxPatients: string;
  maxInvoices: string;
  displayOrder: string;
  isPopular: boolean;
  isActive: boolean;
  features: Record<string, boolean>;
};

const blankForm: FormState = {
  nameAr: "", nameEn: "", descriptionAr: "", descriptionEn: "", priceMonthly: "0", priceYearly: "0", currency: "EGP", maxBranches: "1", maxStaff: "5", maxPatients: "500", maxInvoices: "200", displayOrder: "1", isPopular: false, isActive: true, features: {},
};

function formFromPlan(plan: Plan): FormState {
  return { nameAr: plan.name_ar, nameEn: plan.name_en, descriptionAr: plan.description_ar ?? "", descriptionEn: plan.description_en ?? "", priceMonthly: String(plan.price_monthly), priceYearly: String(plan.price_yearly), currency: plan.currency, maxBranches: String(plan.max_branches), maxStaff: String(plan.max_staff), maxPatients: String(plan.max_patients), maxInvoices: String(plan.max_invoices_monthly), displayOrder: String(plan.display_order), isPopular: plan.is_popular, isActive: plan.is_active, features: { ...plan.features } };
}

export default function PlanCatalogPanel({ onSaved }: { onSaved?: () => void }) {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<Plan | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("subscription_plans").select("id,name_ar,name_en,description_ar,description_en,price_monthly,price_yearly,currency,max_branches,max_staff,max_patients,max_invoices_monthly,features,is_popular,is_active,display_order").order("display_order");
    if (error) toast({ title: isAr ? "تعذر تحميل كتالوج الخطط" : "Unable to load plan catalog", variant: "destructive" });
    setPlans((data ?? []) as Plan[]);
    setLoading(false);
  }, [isAr, toast]);

  useEffect(() => { void load(); }, [load]);

  const open = (plan: Plan) => { setEditor(plan); setForm(formFromPlan(plan)); };
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!editor) return;
    const numberFields = [form.priceMonthly, form.priceYearly, form.maxBranches, form.maxStaff, form.maxPatients, form.maxInvoices, form.displayOrder];
    if (numberFields.some((value) => value.trim() === "" || !Number.isFinite(Number(value)))) {
      toast({ title: isAr ? "أدخل أرقامًا صحيحة لكل الأسعار والحدود" : "Enter valid numbers for prices and limits", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("platform_update_subscription_plan" as never, {
      p_plan_id: editor.id,
      p_payload: {
        name_ar: form.nameAr.trim(), name_en: form.nameEn.trim(), description_ar: form.descriptionAr.trim(), description_en: form.descriptionEn.trim(),
        price_monthly: Number(form.priceMonthly), price_yearly: Number(form.priceYearly), currency: form.currency.trim().toUpperCase(),
        max_branches: Number(form.maxBranches), max_staff: Number(form.maxStaff), max_patients: Number(form.maxPatients), max_invoices_monthly: Number(form.maxInvoices),
        display_order: Number(form.displayOrder), is_popular: form.isPopular, is_active: form.isActive, features: form.features,
      },
    } as never);
    setSaving(false);
    if (error) {
      toast({ title: isAr ? "تعذر حفظ الخطة" : "Unable to save plan", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isAr ? "تم تحديث الخطة والأسعار" : "Plan and pricing updated" });
    setEditor(null);
    await load();
    onSaved?.();
  };

  return <Card><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="flex items-center gap-2 text-base"><Tags className="size-4 text-primary" />{isAr ? "كتالوج الخطط والأسعار" : "Plan & pricing catalog"}</CardTitle><p className="text-xs text-muted-foreground">{isAr ? "تعديل مركزي للخطط العامة" : "Central public plan controls"}</p></CardHeader><CardContent className="space-y-3">{loading ? <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تحميل الخطط…" : "Loading plans…"}</div> : plans.map((plan) => <div key={plan.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{isAr ? plan.name_ar : plan.name_en}</span>{plan.is_popular ? <Badge>{isAr ? "الأكثر شيوعًا" : "Popular"}</Badge> : null}{!plan.is_active ? <Badge variant="secondary">{isAr ? "مخفية" : "Inactive"}</Badge> : null}</div><p className="mt-1 text-sm text-muted-foreground">{Number(plan.price_monthly).toLocaleString()} {plan.currency} / {isAr ? "شهر" : "month"} · {Number(plan.price_yearly).toLocaleString()} {plan.currency} / {isAr ? "سنة" : "year"}</p><p className="mt-1 text-xs text-muted-foreground">{isAr ? `${plan.max_branches >= 999 ? "غير محدود" : plan.max_branches} فروع · ${plan.max_staff >= 999 ? "غير محدود" : plan.max_staff} موظفين` : `${plan.max_branches >= 999 ? "Unlimited" : plan.max_branches} branches · ${plan.max_staff >= 999 ? "Unlimited" : plan.max_staff} staff`}</p></div><Button size="sm" variant="outline" onClick={() => open(plan)}><Edit3 className="me-2 size-3.5" />{isAr ? "تعديل" : "Edit"}</Button></div>)}{!loading && plans.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{isAr ? "لا توجد خطط." : "No plans found."}</p> : null}</CardContent><Dialog open={!!editor} onOpenChange={(value) => !value && setEditor(null)}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}><DialogHeader><DialogTitle>{isAr ? "تعديل الخطة والأسعار" : "Edit plan and pricing"} · {editor ? (isAr ? editor.name_ar : editor.name_en) : ""}</DialogTitle></DialogHeader><div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>{isAr ? "اسم الخطة بالعربية" : "Arabic plan name"}</Label><Input value={form.nameAr} onChange={(event) => update("nameAr", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "اسم الخطة بالإنجليزية" : "English plan name"}</Label><Input value={form.nameEn} onChange={(event) => update("nameEn", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "وصف عربي" : "Arabic description"}</Label><Input value={form.descriptionAr} onChange={(event) => update("descriptionAr", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "وصف إنجليزي" : "English description"}</Label><Input value={form.descriptionEn} onChange={(event) => update("descriptionEn", event.target.value)} /></div></div><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><Label>{isAr ? "السعر الشهري" : "Monthly price"}</Label><Input type="number" min="0" step="0.01" value={form.priceMonthly} onChange={(event) => update("priceMonthly", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "السعر السنوي" : "Yearly price"}</Label><Input type="number" min="0" step="0.01" value={form.priceYearly} onChange={(event) => update("priceYearly", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "العملة" : "Currency"}</Label><Input maxLength={8} value={form.currency} onChange={(event) => update("currency", event.target.value)} dir="ltr" /></div></div><div className="grid gap-3 sm:grid-cols-4"><div className="space-y-1.5"><Label>{isAr ? "حد الفروع" : "Branch limit"}</Label><Input type="number" min="1" value={form.maxBranches} onChange={(event) => update("maxBranches", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "حد الموظفين" : "Staff limit"}</Label><Input type="number" min="1" value={form.maxStaff} onChange={(event) => update("maxStaff", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "حد المرضى" : "Patient limit"}</Label><Input type="number" min="1" value={form.maxPatients} onChange={(event) => update("maxPatients", event.target.value)} /></div><div className="space-y-1.5"><Label>{isAr ? "حد الفواتير الشهري" : "Monthly invoice limit"}</Label><Input type="number" min="1" value={form.maxInvoices} onChange={(event) => update("maxInvoices", event.target.value)} /></div></div><div className="grid gap-3 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPopular} onChange={(event) => update("isPopular", event.target.checked)} />{isAr ? "خطة مميزة" : "Popular plan"}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => update("isActive", event.target.checked)} />{isAr ? "ظاهرة للعامة" : "Visible publicly"}</label><div className="flex items-center gap-2 text-sm"><Label className="shrink-0">{isAr ? "الترتيب" : "Order"}</Label><Input type="number" min="1" value={form.displayOrder} onChange={(event) => update("displayOrder", event.target.value)} /></div></div><div><p className="mb-2 text-sm font-semibold">{isAr ? "مزايا الخطة" : "Plan features"}</p><div className="grid gap-2 sm:grid-cols-2">{FEATURE_KEYS.map((feature) => <label key={feature.key} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={Boolean(form.features[feature.key])} onChange={(event) => update("features", { ...form.features, [feature.key]: event.target.checked })} />{isAr ? feature.ar : feature.en}</label>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setEditor(null)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "حفظ الخطة" : "Save plan"}</Button></DialogFooter></DialogContent></Dialog></Card>;
}
