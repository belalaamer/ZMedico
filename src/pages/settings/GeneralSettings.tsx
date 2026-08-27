import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Upload, ImageIcon } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function GeneralSettings() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [branchId, setBranchId] = useState<string>(currentBranchId ?? "");
  const [uploading, setUploading] = useState(false);
  const [portalSettings, setPortalSettings] = useState({ portal_enabled: true, support_email: "", support_phone: "", complaint_instructions_ar: "", complaint_instructions_en: "" });
  const [form, setForm] = useState<any>({
    clinic_name_ar: "", clinic_name_en: "", logo_url: "", favicon_url: "",
    tagline_ar: "", tagline_en: "", description_ar: "", description_en: "",
    phone: "", phone_secondary: "", email: "", website: "",
    address_ar: "", address_en: "", city: "", country: "Egypt", postal_code: "",
    google_maps_url: "", working_hours_start: "09:00", working_hours_end: "21:00",
    social_facebook: "", social_instagram: "", social_twitter: "", social_whatsapp: "", social_youtube: "",
    tax_registration_number: "", commercial_registration_number: "",
  });

  useEffect(() => {
    if (!branchId) return;
    supabase.from("clinic_profile").select("*").eq("branch_id", branchId).maybeSingle()
      .then(({ data }) => { if (data) setForm({ ...form, ...data }); });
    (supabase as any).from("patient_portal_settings").select("portal_enabled,support_email,support_phone,complaint_instructions_ar,complaint_instructions_en").eq("branch_id", branchId).maybeSingle()
      .then(({ data }: any) => { if (data) setPortalSettings((current) => ({ ...current, ...data })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    const payload = { ...form, branch_id: branchId };
    const { error } = await supabase.from("clinic_profile").upsert(payload, { onConflict: "branch_id" });
    if (error) return toast.error(error.message);
    const { error: portalError } = await (supabase as any).from("patient_portal_settings").upsert({ ...portalSettings, branch_id: branchId }, { onConflict: "branch_id" });
    if (portalError) return toast.error(portalError.message);
    toast.success(t("saved"));
  };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("invalidImageFile"));
    if (file.size > 1024 * 1024) return toast.error(t("maxImageSize"));
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setForm((f: any) => ({ ...f, logo_url: dataUrl }));
      toast.success(t("logoLoaded"));
    } catch (err: any) {
      toast.error(err?.message || t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <SettingsLayout>
      <div className="pb-24">
        <div className="bg-background border-b border-border/60 py-4 px-1 flex justify-between items-center flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("clinicProfile")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {lang === "ar" ? "إدارة معلومات ومظهر العيادة" : "Manage your clinic identity and public information."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="gradient-primary text-primary-foreground shadow-md hover:shadow-lg transition-all" onClick={save}>{t("save")}</Button>
          </div>
        </div>

        <div className="space-y-6 px-1">
        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الهوية والعلامة التجارية" : "Brand & Identity"}</CardTitle>
            <CardDescription>{lang === "ar" ? "اسم العيادة، الشعار، ووصف موجز" : "Clinic names, logo, and tagline used across the platform."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="flex items-center gap-5 flex-wrap p-6 rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors bg-muted/20">
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" className="h-24 w-24 object-contain rounded-lg border bg-background p-2 shadow-sm" />
              ) : (
                <div className="h-24 w-24 rounded-lg border border-dashed bg-background flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
              <div className="space-y-2 flex-1 min-w-[200px]">
                <div className="font-medium">{lang === "ar" ? "لوجو العيادة" : "Clinic Logo"}</div>
                <div className="text-xs text-muted-foreground">{lang === "ar" ? "PNG أو JPG. الحد الأقصى 1 ميجابايت." : "PNG or JPG. Max 1 MB."}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button asChild type="button" variant="outline" size="sm" disabled={uploading}>
                    <label className="cursor-pointer">
                      <Upload className="h-4 w-4 me-2" />
                      {uploading ? (lang === "ar" ? "جارٍ الرفع..." : "Uploading...") : (lang === "ar" ? "رفع صورة" : "Upload Image")}
                      <input type="file" accept="image/*" onChange={onLogoFile} disabled={uploading} className="hidden" />
                    </label>
                  </Button>
                  {form.logo_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, logo_url: "" })}>
                      {lang === "ar" ? "حذف" : "Remove"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{lang === "ar" ? "أو الصق رابط صورة" : "Or paste an image URL"}</Label>
              <Input
                placeholder="https://..."
                value={form.logo_url?.startsWith("data:") ? "" : (form.logo_url ?? "")}
                onChange={e => setForm({ ...form, logo_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("nameEn2")}</Label><Input value={form.clinic_name_en} onChange={e => setForm({ ...form, clinic_name_en: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("nameAr2")}</Label><Input dir="rtl" value={form.clinic_name_ar} onChange={e => setForm({ ...form, clinic_name_ar: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("tagline2")} (EN)</Label><Input value={form.tagline_en ?? ""} onChange={e => setForm({ ...form, tagline_en: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("tagline2")} (AR)</Label><Input dir="rtl" value={form.tagline_ar ?? ""} onChange={e => setForm({ ...form, tagline_ar: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "التواصل والموقع" : "Contact & Location"}</CardTitle>
            <CardDescription>{lang === "ar" ? "معلومات الاتصال والعنوان" : "How patients and partners reach your clinic."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("phone")}</Label><Input value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("email")}</Label><Input value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="md:col-span-2"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("address")} (AR)</Label><Textarea dir="rtl" value={form.address_ar ?? ""} onChange={e => setForm({ ...form, address_ar: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("city")}</Label><Input value={form.city ?? ""} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Country</Label><Input value={form.country ?? ""} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "بوابة المريض والشكاوى" : "Patient portal & complaints"}</CardTitle>
            <CardDescription>{lang === "ar" ? "حدد قنوات التواصل التي تظهر للمريض بعد تسجيل الدخول إلى بوابته." : "Configure the contact channels patients see after signing in to their portal."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4"><div><Label>{lang === "ar" ? "تفعيل بوابة المريض" : "Enable patient portal"}</Label><p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "يمكن إيقاف الدخول لجميع مرضى هذا الفرع دون حذف بياناتهم." : "Disable portal access for this branch without deleting patient data."}</p></div><Switch checked={portalSettings.portal_enabled} onCheckedChange={(value) => setPortalSettings({ ...portalSettings, portal_enabled: value })} /></div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2"><div><Label>{lang === "ar" ? "بريد الشكاوى" : "Complaints email"}</Label><Input type="email" value={portalSettings.support_email} onChange={(e) => setPortalSettings({ ...portalSettings, support_email: e.target.value })} placeholder="support@clinic.com" /></div><div><Label>{lang === "ar" ? "هاتف الشكاوى" : "Complaints phone"}</Label><Input value={portalSettings.support_phone} onChange={(e) => setPortalSettings({ ...portalSettings, support_phone: e.target.value })} placeholder="+20..." /></div><div><Label>{lang === "ar" ? "تعليمات التواصل بالعربية" : "Arabic contact instructions"}</Label><Textarea dir="rtl" value={portalSettings.complaint_instructions_ar} onChange={(e) => setPortalSettings({ ...portalSettings, complaint_instructions_ar: e.target.value })} /></div><div><Label>{lang === "ar" ? "تعليمات التواصل بالإنجليزية" : "English contact instructions"}</Label><Textarea value={portalSettings.complaint_instructions_en} onChange={(e) => setPortalSettings({ ...portalSettings, complaint_instructions_en: e.target.value })} /></div></div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "ساعات العمل" : "Operating Hours"}</CardTitle>
            <CardDescription>{lang === "ar" ? "أوقات فتح وإغلاق العيادة" : "Default open and close times for this branch."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("workingHours")} Start</Label><Input type="time" value={form.working_hours_start} onChange={e => setForm({ ...form, working_hours_start: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("workingHours")} End</Label><Input type="time" value={form.working_hours_end} onChange={e => setForm({ ...form, working_hours_end: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "روابط التواصل الاجتماعي" : "Social Links"}</CardTitle>
            <CardDescription>{lang === "ar" ? "روابط منصات التواصل الرسمية" : "Public profiles displayed on receipts and portals."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Facebook</Label><Input value={form.social_facebook ?? ""} onChange={e => setForm({ ...form, social_facebook: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Instagram</Label><Input value={form.social_instagram ?? ""} onChange={e => setForm({ ...form, social_instagram: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">WhatsApp</Label><Input value={form.social_whatsapp ?? ""} onChange={e => setForm({ ...form, social_whatsapp: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Twitter / X</Label><Input value={form.social_twitter ?? ""} onChange={e => setForm({ ...form, social_twitter: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">YouTube</Label><Input value={form.social_youtube ?? ""} onChange={e => setForm({ ...form, social_youtube: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الفوترة والمعلومات القانونية" : "Legal & Billing"}</CardTitle>
            <CardDescription>{lang === "ar" ? "الأرقام الضريبية والتجارية للعيادة" : "Registration numbers used on invoices and legal documents."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("taxRegistrationNumber")}</Label><Input value={form.tax_registration_number ?? ""} onChange={e => setForm({ ...form, tax_registration_number: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("commercialRegistrationNumber")}</Label><Input value={form.commercial_registration_number ?? ""} onChange={e => setForm({ ...form, commercial_registration_number: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>
        </div>

        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/90 backdrop-blur-md md:hidden">
          <div className="p-3 flex justify-end">
            <Button className="gradient-primary text-primary-foreground w-full" onClick={save}>{t("save")}</Button>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}