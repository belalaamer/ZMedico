import { useMemo, useState } from "react";
import { Building2, Check, Loader2, Rocket } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CLINIC_MODULES, type ClinicModuleKey } from "@/lib/clinicModules";
import { normalizeTenantSlug } from "@/lib/saasOnboarding";
import { defaultModulesForPlan, planAllowsModule } from "@/lib/subscriptionEntitlements";

type Plan = { id: string; name_ar: string; name_en: string; max_branches: number; max_staff: number; max_patients?: number; max_invoices_monthly?: number; price_monthly?: number; price_yearly?: number; features?: Record<string, boolean> };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; plans: Plan[]; onCreated: () => Promise<void> | void };

type FormState = {
  tenantName: string;
  slug: string;
  billingEmail: string;
  planId: string;
  branchNameEn: string;
  branchNameAr: string;
  phone: string;
  city: string;
  address: string;
  durationDays: string;
  billingCycle: "monthly" | "yearly";
};

const coreKeys = new Set<ClinicModuleKey>(CLINIC_MODULES.filter((module) => module.alwaysOn).map((module) => module.key));

function initialModules(plan: Plan | undefined) {
  return new Set<ClinicModuleKey>(defaultModulesForPlan(plan?.features ?? {}));
}

export default function OnboardingWizard({ open, onOpenChange, plans, onCreated }: Props) {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [saving, setSaving] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [form, setForm] = useState<FormState>({ tenantName: "", slug: "", billingEmail: "", planId: "", branchNameEn: "", branchNameAr: "", phone: "", city: "", address: "", durationDays: "14", billingCycle: "monthly" });
  const [selected, setSelected] = useState<Set<ClinicModuleKey>>(() => new Set(coreKeys));

  const groups = useMemo(() => [
    { key: "specialty", title: isAr ? "الوحدات التخصصية" : "Specialty modules" },
    { key: "business", title: isAr ? "وحدات الأعمال" : "Business modules" },
  ], [isAr]);

  const reset = () => {
    setForm({ tenantName: "", slug: "", billingEmail: "", planId: "", branchNameEn: "", branchNameAr: "", phone: "", city: "", address: "", durationDays: "14", billingCycle: "monthly" });
    setSlugEdited(false);
    setSelected(initialModules(undefined));
  };

  const close = (value: boolean) => {
    if (!value && !saving) { reset(); onOpenChange(false); }
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const name = form.tenantName.trim();
    const slug = form.slug.trim().toLowerCase();
    if (!name || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
      toast({ title: isAr ? "أدخل اسم العميل وSlug صحيحًا مثل al-noor-clinic" : "Enter the tenant name and a valid slug such as al-noor-clinic", variant: "destructive" });
      return;
    }
    if (!form.branchNameEn.trim()) {
      toast({ title: isAr ? "اسم الفرع بالإنجليزية مطلوب" : "The first branch English name is required", variant: "destructive" });
      return;
    }
    const durationDays = Number.parseInt(form.durationDays, 10);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
      toast({ title: isAr ? "المدة يجب أن تكون بين يوم و3650 يومًا" : "Duration must be between 1 and 3650 days", variant: "destructive" });
      return;
    }
    if (!form.planId) {
      toast({ title: isAr ? "اختر خطة الاشتراك أولًا" : "Choose a subscription plan first", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      tenant: { name, slug, billing_email: form.billingEmail.trim() || null, plan_id: form.planId },
      subscription: { duration_days: durationDays, billing_cycle: form.billingCycle },
      branch: { name_en: form.branchNameEn.trim(), name_ar: form.branchNameAr.trim() || form.branchNameEn.trim(), phone: form.phone.trim() || null, city: form.city.trim() || null, address: form.address.trim() || null },
      modules: Array.from(selected),
    };
    const { data, error } = await supabase.rpc("platform_create_tenant_onboarding" as never, { payload } as never);
    if (error || !data) {
      toast({ title: error?.message ?? (isAr ? "تعذر إنشاء العميل" : "Unable to create tenant"), variant: "destructive" });
      setSaving(false);
      return;
    }
    const result = data as { tenant_id?: string; branch_id?: string };
    toast({ title: isAr ? "تم إنشاء العميل والفرع والوحدات" : "Tenant, first branch and modules created", description: result.tenant_id ? `${result.tenant_id.slice(0, 8)}…` : undefined });
    setSaving(false);
    reset();
    onOpenChange(false);
    await onCreated();
  };

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl"><Rocket className="size-5 text-primary" />{isAr ? "تفعيل عميل جديد" : "Onboard a new tenant"}</DialogTitle>
        <p className="text-sm text-muted-foreground">{isAr ? "عملية ذرية: سيتم إنشاء العميل والفرع الأول والوحدات معًا، أو لن يُحفظ أي جزء." : "Atomic setup: tenant, first branch and modules are committed together, or nothing is saved."}</p>
      </DialogHeader>

      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center gap-2 font-semibold"><Building2 className="size-4 text-primary" />{isAr ? "بيانات العميل" : "Tenant details"}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{isAr ? "اسم العميل / العيادة" : "Tenant / clinic name"}</Label><Input value={form.tenantName} onChange={(e) => { update("tenantName", e.target.value); if (!slugEdited) update("slug", normalizeTenantSlug(e.target.value)); }} placeholder={isAr ? "عيادة النور" : "Al Noor Clinic"} /></div>
            <div className="space-y-1.5"><Label>Slug</Label><Input dir="ltr" value={form.slug} onChange={(e) => { setSlugEdited(true); update("slug", normalizeTenantSlug(e.target.value)); }} placeholder="al-noor-clinic" /><p className="text-xs text-muted-foreground">{isAr ? "حروف إنجليزية صغيرة وأرقام وشرطات فقط." : "Lowercase letters, numbers and hyphens only."}</p></div>
            <div className="space-y-1.5"><Label>{isAr ? "بريد الفوترة (اختياري)" : "Billing email (optional)"}</Label><Input type="email" value={form.billingEmail} onChange={(e) => update("billingEmail", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{isAr ? "خطة الاشتراك" : "Subscription plan"}</Label><Select value={form.planId || "none"} onValueChange={(value) => { const planId = value === "none" ? "" : value; update("planId", planId); setSelected(initialModules(plans.find((plan) => plan.id === planId))); }}><SelectTrigger><SelectValue placeholder={isAr ? "اختر الخطة" : "Choose a plan"} /></SelectTrigger><SelectContent><SelectItem value="none">{isAr ? "اختر الخطة" : "Choose a plan"}</SelectItem>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</SelectItem>)}</SelectContent></Select>{form.planId ? <p className="text-xs text-muted-foreground">{(() => { const plan = plans.find((item) => item.id === form.planId); return plan ? `${plan.max_branches} ${isAr ? "فروع" : "branches"} · ${plan.max_staff} ${isAr ? "موظفين" : "staff"}` : ""; })()}</p> : null}</div>
            <div className="space-y-1.5"><Label>{isAr ? "مدة التجربة / الاشتراك بالأيام" : "Trial / subscription duration (days)"}</Label><Input type="number" min={1} max={3650} value={form.durationDays} onChange={(e) => update("durationDays", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{isAr ? "دورة الفوترة" : "Billing cycle"}</Label><Select value={form.billingCycle} onValueChange={(value) => update("billingCycle", value as FormState["billingCycle"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem><SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem></SelectContent></Select></div>
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="font-semibold">{isAr ? "الفرع الأول" : "First branch"}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{isAr ? "اسم الفرع بالإنجليزية" : "Branch name (English)"}</Label><Input dir="ltr" value={form.branchNameEn} onChange={(e) => update("branchNameEn", e.target.value)} placeholder="Main Branch" /></div>
            <div className="space-y-1.5"><Label>{isAr ? "اسم الفرع بالعربية (اختياري)" : "Branch name (Arabic, optional)"}</Label><Input value={form.branchNameAr} onChange={(e) => update("branchNameAr", e.target.value)} placeholder="الفرع الرئيسي" /></div>
            <div className="space-y-1.5"><Label>{isAr ? "الهاتف" : "Phone"}</Label><Input dir="ltr" value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{isAr ? "المدينة" : "City"}</Label><Input value={form.city} onChange={(e) => update("city", e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "العنوان" : "Address"}</Label><Input value={form.address} onChange={(e) => update("address", e.target.value)} /></div>
          </div>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div><div className="font-semibold">{isAr ? "الوحدات المفعلة" : "Enabled modules"}</div><p className="text-xs text-muted-foreground">{isAr ? "الوحدات الأساسية مفعلة دائمًا. الوحدات التي لا تشملها الخطة تظهر معطلة ولا يمكن إرسالها إلى قاعدة البيانات." : "Core modules are always enabled. Modules not included in the selected plan are disabled and cannot be sent to the database."}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => <div key={group.key} className="space-y-2"><div className="text-sm font-medium text-muted-foreground">{group.title}</div>{CLINIC_MODULES.filter((module) => module.group === group.key && !module.alwaysOn).map((module) => { const enabled = selected.has(module.key); const planAllowed = planAllowsModule(module.key, plans.find((plan) => plan.id === form.planId)?.features ?? {}); return <label key={module.key} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${planAllowed ? "cursor-pointer" : "cursor-not-allowed bg-muted/40 opacity-70"}`}><span><span className="block text-sm font-medium">{isAr ? module.nameAr : module.nameEn}</span><span className="block text-xs text-muted-foreground">{isAr ? module.descriptionAr : module.descriptionEn}</span>{!planAllowed ? <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">{isAr ? "غير متاحة في الخطة الحالية" : "Not included in selected plan"}</span> : null}</span><input type="checkbox" checked={enabled} disabled={!planAllowed} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(module.key)) next.delete(module.key); else next.add(module.key); return next; })} className="size-4 accent-primary" /></label>; })}</div>)}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{CLINIC_MODULES.filter((module) => module.alwaysOn).map((module) => <span key={module.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><Check className="size-3" />{isAr ? module.nameAr : module.nameEn}</span>)}</div>
        </section>
      </div>

      <DialogFooter><Button variant="outline" onClick={() => close(false)} disabled={saving}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : <Rocket className="me-2 size-4" />}{isAr ? "إنشاء وتفعيل" : "Create and onboard"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
