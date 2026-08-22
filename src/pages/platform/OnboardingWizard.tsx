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

type Plan = { id: string; name_ar: string; name_en: string; max_branches: number; max_staff: number };
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
};

const coreKeys = new Set<ClinicModuleKey>(CLINIC_MODULES.filter((module) => module.alwaysOn).map((module) => module.key));

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

export default function OnboardingWizard({ open, onOpenChange, plans, onCreated }: Props) {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [saving, setSaving] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [form, setForm] = useState<FormState>({ tenantName: "", slug: "", billingEmail: "", planId: "", branchNameEn: "", branchNameAr: "", phone: "", city: "", address: "" });
  const [selected, setSelected] = useState<Set<ClinicModuleKey>>(() => new Set(coreKeys));

  const groups = useMemo(() => [
    { key: "specialty", title: isAr ? "الوحدات التخصصية" : "Specialty modules" },
    { key: "business", title: isAr ? "وحدات الأعمال" : "Business modules" },
  ], [isAr]);

  const reset = () => {
    setForm({ tenantName: "", slug: "", billingEmail: "", planId: "", branchNameEn: "", branchNameAr: "", phone: "", city: "", address: "" });
    setSlugEdited(false);
    setSelected(new Set(coreKeys));
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
    setSaving(true);
    const payload = {
      tenant: { name, slug, billing_email: form.billingEmail.trim() || null, plan_id: form.planId || null },
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
            <div className="space-y-1.5"><Label>{isAr ? "اسم العميل / العيادة" : "Tenant / clinic name"}</Label><Input value={form.tenantName} onChange={(e) => { update("tenantName", e.target.value); if (!slugEdited) update("slug", slugify(e.target.value)); }} placeholder={isAr ? "عيادة النور" : "Al Noor Clinic"} /></div>
            <div className="space-y-1.5"><Label>Slug</Label><Input dir="ltr" value={form.slug} onChange={(e) => { setSlugEdited(true); update("slug", slugify(e.target.value)); }} placeholder="al-noor-clinic" /><p className="text-xs text-muted-foreground">{isAr ? "حروف إنجليزية صغيرة وأرقام وشرطات فقط." : "Lowercase letters, numbers and hyphens only."}</p></div>
            <div className="space-y-1.5"><Label>{isAr ? "بريد الفوترة (اختياري)" : "Billing email (optional)"}</Label><Input type="email" value={form.billingEmail} onChange={(e) => update("billingEmail", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{isAr ? "خطة الاشتراك" : "Subscription plan"}</Label><Select value={form.planId || "none"} onValueChange={(value) => update("planId", value === "none" ? "" : value)}><SelectTrigger><SelectValue placeholder={isAr ? "اختر الخطة" : "Choose a plan"} /></SelectTrigger><SelectContent><SelectItem value="none">{isAr ? "بدون خطة الآن" : "No plan yet"}</SelectItem>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{isAr ? plan.name_ar : plan.name_en}</SelectItem>)}</SelectContent></Select></div>
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
          <div><div className="font-semibold">{isAr ? "الوحدات المفعلة" : "Enabled modules"}</div><p className="text-xs text-muted-foreground">{isAr ? "الوحدات الأساسية مطلوبة. الوحدات التخصصية والتجارية اختيارية ويمكن تغييرها لاحقًا." : "Core modules are required. Specialty and business modules are optional and can be changed later."}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => <div key={group.key} className="space-y-2"><div className="text-sm font-medium text-muted-foreground">{group.title}</div>{CLINIC_MODULES.filter((module) => module.group === group.key).map((module) => { const enabled = selected.has(module.key); return <label key={module.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 has-[:disabled]:cursor-default has-[:disabled]:bg-muted/40"><span><span className="block text-sm font-medium">{isAr ? module.nameAr : module.nameEn}</span><span className="block text-xs text-muted-foreground">{isAr ? module.descriptionAr : module.descriptionEn}</span></span><input type="checkbox" checked={enabled} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(module.key)) next.delete(module.key); else next.add(module.key); return next; })} className="size-4 accent-primary" /></label>; })}</div>)}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{CLINIC_MODULES.filter((module) => module.alwaysOn).map((module) => <span key={module.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><Check className="size-3" />{isAr ? module.nameAr : module.nameEn}</span>)}</div>
        </section>
      </div>

      <DialogFooter><Button variant="outline" onClick={() => close(false)} disabled={saving}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : <Rocket className="me-2 size-4" />}{isAr ? "إنشاء وتفعيل" : "Create and onboard"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
