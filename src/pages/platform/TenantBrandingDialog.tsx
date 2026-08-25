import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type BrandingTenant = { id: string; name: string };

type BrandingSource = "zmedico" | "tenant";

type BrandingForm = {
  display_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  show_powered_by: boolean;
  display_name_source: BrandingSource;
  logo_source: BrandingSource;
  favicon_source: BrandingSource;
  colors_source: BrandingSource;
};

const DEFAULT_FORM: BrandingForm = {
  display_name: "",
  logo_url: "",
  favicon_url: "",
  primary_color: "#3a1a5e",
  secondary_color: "#6d3bb3",
  accent_color: "#d7b86e",
  show_powered_by: true,
  display_name_source: "tenant",
  logo_source: "tenant",
  favicon_source: "tenant",
  colors_source: "tenant",
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
    void supabase.from("tenant_branding").select("display_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,show_powered_by,display_name_source,logo_source,favicon_source,colors_source").eq("tenant_id", tenant.id).maybeSingle()
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
            favicon_url: row?.favicon_url ?? "",
            primary_color: row?.primary_color ?? DEFAULT_FORM.primary_color,
            secondary_color: row?.secondary_color ?? DEFAULT_FORM.secondary_color,
            accent_color: row?.accent_color ?? DEFAULT_FORM.accent_color,
            show_powered_by: row?.show_powered_by ?? true,
            display_name_source: row?.display_name_source === "zmedico" ? "zmedico" : "tenant",
            logo_source: row?.logo_source === "zmedico" ? "zmedico" : "tenant",
            favicon_source: row?.favicon_source === "zmedico" ? "zmedico" : "tenant",
            colors_source: row?.colors_source === "zmedico" ? "zmedico" : "tenant",
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

  const uploadFavicon = async (file: File | undefined) => {
    if (!file || !tenant) return;
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const isIco = extension === "ico";
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];
    if (!allowed.includes(file.type) && !(isIco && !file.type)) {
      toast({ title: isAr ? "اختر PNG أو JPG أو WEBP أو SVG أو ICO فقط" : "Choose PNG, JPG, WEBP, SVG, or ICO only", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: isAr ? "حجم أيقونة المتصفح يجب ألا يتجاوز 2MB" : "Favicon must be 2MB or smaller", variant: "destructive" });
      return;
    }
    setUploading(true);
    const path = `${tenant.id}/favicon-${Date.now()}.${extension}`;
    const contentType = file.type || (isIco ? "image/x-icon" : "image/png");
    const { error } = await supabase.storage.from("tenant-branding").upload(path, file, { upsert: true, contentType });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      const { data } = supabase.storage.from("tenant-branding").getPublicUrl(path);
      setForm((current) => ({ ...current, favicon_url: data.publicUrl }));
      toast({ title: isAr ? "تم تحميل أيقونة المتصفح" : "Favicon uploaded" });
    }
    setUploading(false);
  };

  const save = async () => {
    if (!tenant) return;
    setSaving(true);
    const displayName = form.display_name.trim() || tenant.name;
    const { data: saved, error } = await supabase.rpc("platform_save_tenant_branding", {
      p_tenant_id: tenant.id,
      p_display_name: displayName,
      p_logo_url: form.logo_url.trim() || null,
      p_favicon_url: form.favicon_url.trim() || null,
      p_primary_color: form.primary_color,
      p_secondary_color: form.secondary_color,
      p_accent_color: form.accent_color,
      p_show_powered_by: form.show_powered_by,
      p_display_name_source: form.display_name_source,
      p_logo_source: form.logo_source,
      p_favicon_source: form.favicon_source,
      p_colors_source: form.colors_source,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else if (!saved || saved.show_powered_by !== form.show_powered_by) {
      toast({ title: isAr ? "لم يتم تأكيد حفظ إعداد Powered by" : "Powered by setting could not be confirmed", variant: "destructive" });
    } else {
      toast({ title: isAr ? "تم حفظ هوية العميل" : "Tenant branding saved" });
      onSaved?.();
      onOpenChange(false);
    }
    setSaving(false);
  };

  const previewName = form.display_name_source === "zmedico" ? "ZMedico" : (form.display_name || tenant?.name);
  const previewLogo = form.logo_source === "zmedico" ? "" : form.logo_url;
  const previewColors = form.colors_source === "zmedico"
    ? { primary: "#3a1a5e", secondary: "#6d3bb3" }
    : { primary: form.primary_color, secondary: form.secondary_color };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir={isAr ? "rtl" : "ltr"}>
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Palette className="size-5 text-primary" />{isAr ? "هوية العميل White‑Label" : "Tenant White‑Label branding"} · {tenant?.name}</DialogTitle></DialogHeader>
      {loading ? <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="me-2 inline size-4 animate-spin" />{isAr ? "جارٍ تحميل الهوية…" : "Loading branding…"}</div> : <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "اسم العرض داخل النظام" : "Display name"}</Label><Input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} placeholder={tenant?.name} maxLength={160} disabled={form.display_name_source === "zmedico"} /></div>
          <div className="space-y-1.5"><Label>{isAr ? "مصدر الاسم" : "Name source"}</Label><Select value={form.display_name_source} onValueChange={(value: BrandingSource) => setForm((current) => ({ ...current, display_name_source: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tenant">{isAr ? "هوية العيادة" : "Clinic brand"}</SelectItem><SelectItem value="zmedico">ZMedico</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "الشعار الرئيسي" : "Main logo"}</Label><div className="flex flex-wrap items-center gap-3"><Input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={uploading || form.logo_source === "zmedico"} className="max-w-sm" /><span className="text-xs text-muted-foreground">{isAr ? "PNG أو JPG أو WEBP أو SVG حتى 2MB" : "PNG, JPG, WEBP, or SVG up to 2MB"}</span></div><Input dir="ltr" value={form.logo_url} onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))} placeholder="https://…/logo.png" disabled={form.logo_source === "zmedico"} /></div>
          <div className="space-y-1.5"><Label>{isAr ? "مصدر الشعار" : "Logo source"}</Label><Select value={form.logo_source} onValueChange={(value: BrandingSource) => setForm((current) => ({ ...current, logo_source: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tenant">{isAr ? "شعار العيادة" : "Clinic logo"}</SelectItem><SelectItem value="zmedico">{isAr ? "شعار ZMedico" : "ZMedico logo"}</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "أيقونة المتصفح (Favicon)" : "Browser icon (Favicon)"}</Label><div className="flex flex-wrap items-center gap-3"><Input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico" onChange={(event) => { void uploadFavicon(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={uploading || form.favicon_source === "zmedico"} className="max-w-sm" /><span className="text-xs text-muted-foreground">{isAr ? "PNG أو JPG أو WEBP أو SVG أو ICO حتى 2MB" : "PNG, JPG, WEBP, SVG, or ICO up to 2MB"}</span></div><Input dir="ltr" value={form.favicon_url} onChange={(event) => setForm((current) => ({ ...current, favicon_url: event.target.value }))} placeholder="https://…/favicon.ico" disabled={form.favicon_source === "zmedico"} /><p className="text-xs text-muted-foreground">{isAr ? "تظهر في علامة تبويب المتصفح لكل نطاق عيادة." : "Shown in the browser tab for the clinic domain."}</p></div>
          <div className="space-y-1.5"><Label>{isAr ? "مصدر أيقونة المتصفح" : "Favicon source"}</Label><Select value={form.favicon_source} onValueChange={(value: BrandingSource) => setForm((current) => ({ ...current, favicon_source: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tenant">{isAr ? "أيقونة العيادة" : "Clinic favicon"}</SelectItem><SelectItem value="zmedico">{isAr ? "أيقونة ZMedico" : "ZMedico favicon"}</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{isAr ? "مصدر الألوان" : "Colors source"}</Label><Select value={form.colors_source} onValueChange={(value: BrandingSource) => setForm((current) => ({ ...current, colors_source: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tenant">{isAr ? "ألوان العيادة" : "Clinic colors"}</SelectItem><SelectItem value="zmedico">{isAr ? "ألوان ZMedico" : "ZMedico colors"}</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">{isAr ? "يمكنك الاحتفاظ بألوان العيادة محفوظة حتى عند تفعيل ألوان ZMedico." : "Clinic colors remain saved even when ZMedico colors are active."}</p></div>
          {(["primary_color", "secondary_color", "accent_color"] as const).map((key) => <div key={key} className="space-y-1.5"><Label>{key === "primary_color" ? (isAr ? "اللون الأساسي" : "Primary color") : key === "secondary_color" ? (isAr ? "اللون الثانوي" : "Secondary color") : (isAr ? "لون التمييز" : "Accent color")}</Label><div className="flex items-center gap-2"><input type="color" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} disabled={form.colors_source === "zmedico"} className="size-10 cursor-pointer rounded-md border bg-background p-1" /><Input dir="ltr" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} disabled={form.colors_source === "zmedico"} pattern="^#[0-9a-fA-F]{6}$" maxLength={7} /></div></div>)}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><div className="font-medium">{isAr ? "إظهار Powered by ZMedico" : "Show Powered by ZMedico"}</div><p className="mt-1 text-xs text-muted-foreground">{isAr ? "أوقفه لإخفاء اسم وشعار ZMedico من تجربة العميل." : "Turn this off to hide ZMedico name and logo from the tenant experience."}</p></div><Switch checked={form.show_powered_by} onCheckedChange={(checked) => setForm((current) => ({ ...current, show_powered_by: checked }))} /></div>
        <Card className="overflow-hidden border-0 p-0 shadow-sm"><div className="p-5" style={{ background: `linear-gradient(135deg, ${previewColors.primary}, ${previewColors.secondary})` }}><div className="flex items-center gap-3 text-white">{previewLogo ? <img src={previewLogo} alt={previewName || tenant?.name} className="size-12 rounded-xl bg-white/15 object-contain p-1" /> : <div className="flex size-12 items-center justify-center rounded-xl bg-white/15"><ImagePlus className="size-6" /></div>}<div><div className="font-bold">{previewName}</div><div className="text-xs text-white/75">{isAr ? "معاينة هوية العيادة" : "Clinic identity preview"}</div></div></div></div><div className="p-4 text-sm text-muted-foreground">{isAr ? "ستظهر هذه الهوية في صفحة الدخول وداخل مساحة تشغيل العميل." : "This identity appears on the tenant login page and inside its operational workspace."}</div></Card>
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{isAr ? "إلغاء" : "Cancel"}</Button><Button onClick={() => void save()} disabled={loading || saving || uploading || !tenant}>{saving ? <Loader2 className="me-2 size-4 animate-spin" /> : null}{isAr ? "حفظ الهوية" : "Save branding"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
