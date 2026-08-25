import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type BrandingTenant = { id: string; name: string };

type BrandingForm = {
  display_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  show_powered_by: boolean;
};

const DEFAULT_FORM: BrandingForm = {
  display_name: "",
  logo_url: "",
  primary_color: "#3a1a5e",
  secondary_color: "#6d3bb3",
  accent_color: "#d7b86e",
  show_powered_by: true,
};

export default function TenantBrandingDialog({ tenant, open, onOpenChange, onSaved }: { tenant: BrandingTenant | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved?: () => void }) {
  const { lang } = useI18n();
  const { toast } = useToast();
  const isAr = lang === "ar";
  const [form, setForm] = useState<BrandingForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open || !tenant) return;
    let active = true;
    setLoading(true);
    void supabase.from("tenant_branding").select("display_name,logo_url,primary_color,secondary_color,accent_color,show_powered_by").eq("tenant_id", tenant.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          toast({ title: error.message, variant: "destructive" });
          setForm(DEFAULT_FORM);
        } else {
          const row = data as Partial<BrandingForm> | null;
          setForm({
            display_name: row?.display_name ?? tenant.name,
            logo_url: row?.logo_url ?? "",
            primary_color: row?.primary_color ?? DEFAULT_FORM.primary_color,
            secondary_color: row?.secondary_color ?? DEFAULT_FORM.secondary_color,
            accent_color: row?.accent_color ?? DEFAULT_FORM.accent_color,
            show_powered_by: row?.show_powered_by ?? true,
          });
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [open, tenant, toast]);

  const uploadLogo = async (file: File | undefined) => {
    if (!file || !tenant) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast({ title: isAr ? "اختر PNG أو JPG أو WEBP أو SVG فقط" : "Choose PNG, JPG, WEBP, or SVG only", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: isAr ? "حجم الشعار يجب ألا يتجاوز 2MB" : "Logo must be 2MB or smaller", variant: "destructive" });
      return;
    }
    setUploading(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${tenant.id}/logo-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("tenant-branding").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      const { data } = supabase.storage.from("tenant-branding").getPublicUrl(path);
      setForm((current) => ({ ...current, logo_url: data.publicUrl }));
      toast({ title: isAr ? "تم تحميل الشعار" : "Logo uploaded" });
    }
    setUploading(false);
  };

  const save = async () => {
    if (!tenant) return;
    setSaving(true);
    const displayName = form.display_name.trim() || tenant.name;
    const { error } = await supabase.from("tenant_branding").upsert({ tenant_id: tenant.id, display_name: displayName, logo_url: form.logo_url.trim() || null, primary_color: form.primary_color, secondary_color: form.secondary_color, accent_color: form.accent_color, show_powered_by: form.show_powered_by }, { onConflict: "tenant_id" });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: isAr ? "تم حفظ هوية العميل" : "Tenant branding saved" });
      onSaved?.();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Palette className="size-5 text-primary" />{isAr ? "هوية العميل White‑Label" : "Tenant White‑Label branding"} · {tenant?.name}</DialogTitle></DialogHeader>
      {loading ? <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تحميل الهوية…" : "Loading branding…"}</div> : <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "اسم العرض داخل النظام" : "Display name"}</Label><Input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} placeholder={tenant?.name} maxLength={160} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "الشعار" : "Logo"}</Label><div className="flex flex-wrap items-center gap-3"><Input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={uploading} className="max-w-sm" /><span className="text-xs text-muted-foreground">{isAr ? "حتى 2MB" : "Up to 2MB"}</span></div><Input dir="ltr" value={form.logo_url} onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))} placeholder="https://…/logo.png" /></div>
          {(["primary_color", "secondary_color", "accent_color"] as const).map((key) => <div key={key} className="space-y-1.5"><Label>{key === "primary_color" ? (isAr ? "اللون الأساسي" : "Primary color") : key === "secondary_color" ? (isAr ? "اللون الثانوي" : "Secondary color") : (isAr ? "لون التمييز" : "Accent color")}</Label><div className="flex items-center gap-2"><input type="color" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="size-10 cursor-pointer rounded-md border bg-background p-1" /><Input dir="ltr" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} pattern="^#[0-9a-fA-F]{6}$" maxLength={7} /></div></div>)}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><div className="font-medium">{isAr ? "إظهار Powered by ZMedico" : "Show Powered by ZMedico"}</div><p className="mt-1 text-xs text-muted-foreground">{isAr ? "أوقفه لإخفاء اسم وشعار ZMedico من تجربة العميل." : "Turn this off to hide ZMedico name and logo from the tenant experience."}</p></div><Switch checked={form.show_powered_by} onCheckedChange={(checked) => setForm((current) => ({ ...current, show_powered_by: checked }))} /></div>
        <Card className="overflow-hidden border-0 p-0 shadow-sm"><div className="p-5" style={{ background: `linear-gradient(135deg, ${form.primary_color}, ${form.secondary_color})` }}><div className="flex items-center gap-3 text-white">{form.logo_url ? <img src={form.logo_url} alt={form.display_name || tenant?.name} className="size-12 rounded-xl bg-white/15 object-contain p-1" /> : <div className="flex size-12 items-center justify-center rounded-xl bg-white/15"><ImagePlus className="size-6" /></div>}<div><div className="font-bold">{form.display_name || tenant?.name}</div><div className="text-xs text-white/75">{isAr ? "معاينة هوية العيادة" : "Clinic identity preview"}</div></div></div></div><div className="p-4 text-sm text-muted-foreground">{isAr ? "ستظهر هذه الهوية في صفحة الدخول وداخل مساحة تشغيل العميل." : "This identity appears on the tenant login page and inside its operational workspace."}</div></Card>
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void save()} disabled={loading || saving || uploading || !tenant}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "حفظ الهوية" : "Save branding"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
