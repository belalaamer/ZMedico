import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const save = async () => {
    if (!branchId) return toast.error(t("branch"));
    const payload = { ...form, branch_id: branchId };
    const { error } = await supabase.from("clinic_profile").upsert(payload, { onConflict: "branch_id" });
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
  };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please pick an image file");
    if (file.size > 1024 * 1024) return toast.error("Max 1 MB");
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setForm((f: any) => ({ ...f, logo_url: dataUrl }));
      toast.success(lang === "ar" ? "تم رفع اللوجو، اضغط حفظ" : "Logo loaded — click Save");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SettingsLayout>
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between flex-wrap gap-3 sticky top-0 z-20 bg-background/80 backdrop-blur-md py-3 -mx-1 px-1 border-b">
          <h1 className="text-2xl font-bold">{t("clinicProfile")}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الهوية والعلامة التجارية" : "Brand & Identity"}</CardTitle>
            <CardDescription>{lang === "ar" ? "اسم العيادة، الشعار، ووصف موجز" : "Clinic names, logo, and tagline used across the platform."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-5 flex-wrap p-4 rounded-lg border bg-muted/30">
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" className="h-24 w-24 object-contain rounded-lg border bg-white p-2 shadow-sm" />
              ) : (
                <div className="h-24 w-24 rounded-lg border bg-background flex items-center justify-center text-muted-foreground">
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
              <Label className="text-xs text-muted-foreground">{lang === "ar" ? "أو الصق رابط صورة" : "Or paste an image URL"}</Label>
              <Input
                className="mt-1"
                placeholder="https://..."
                value={form.logo_url?.startsWith("data:") ? "" : (form.logo_url ?? "")}
                onChange={e => setForm({ ...form, logo_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t("nameEn2")}</Label><Input value={form.clinic_name_en} onChange={e => setForm({ ...form, clinic_name_en: e.target.value })} /></div>
              <div><Label>{t("nameAr2")}</Label><Input dir="rtl" value={form.clinic_name_ar} onChange={e => setForm({ ...form, clinic_name_ar: e.target.value })} /></div>
              <div><Label>{t("tagline2")} (EN)</Label><Input value={form.tagline_en ?? ""} onChange={e => setForm({ ...form, tagline_en: e.target.value })} /></div>
              <div><Label>{t("tagline2")} (AR)</Label><Input dir="rtl" value={form.tagline_ar ?? ""} onChange={e => setForm({ ...form, tagline_ar: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "التواصل والموقع" : "Contact & Location"}</CardTitle>
            <CardDescription>{lang === "ar" ? "معلومات الاتصال والعنوان" : "How patients and partners reach your clinic."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t("phone")}</Label><Input value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>{t("email")}</Label><Input value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>{t("address")} (AR)</Label><Textarea dir="rtl" value={form.address_ar ?? ""} onChange={e => setForm({ ...form, address_ar: e.target.value })} /></div>
              <div><Label>{t("city")}</Label><Input value={form.city ?? ""} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>Country</Label><Input value={form.country ?? ""} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "ساعات العمل" : "Operating Hours"}</CardTitle>
            <CardDescription>{lang === "ar" ? "أوقات فتح وإغلاق العيادة" : "Default open and close times for this branch."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t("workingHours")} Start</Label><Input type="time" value={form.working_hours_start} onChange={e => setForm({ ...form, working_hours_start: e.target.value })} /></div>
              <div><Label>{t("workingHours")} End</Label><Input type="time" value={form.working_hours_end} onChange={e => setForm({ ...form, working_hours_end: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "روابط التواصل الاجتماعي" : "Social Links"}</CardTitle>
            <CardDescription>{lang === "ar" ? "روابط منصات التواصل الرسمية" : "Public profiles displayed on receipts and portals."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Facebook</Label><Input value={form.social_facebook ?? ""} onChange={e => setForm({ ...form, social_facebook: e.target.value })} /></div>
              <div><Label>Instagram</Label><Input value={form.social_instagram ?? ""} onChange={e => setForm({ ...form, social_instagram: e.target.value })} /></div>
              <div><Label>WhatsApp</Label><Input value={form.social_whatsapp ?? ""} onChange={e => setForm({ ...form, social_whatsapp: e.target.value })} /></div>
              <div><Label>Twitter / X</Label><Input value={form.social_twitter ?? ""} onChange={e => setForm({ ...form, social_twitter: e.target.value })} /></div>
              <div><Label>YouTube</Label><Input value={form.social_youtube ?? ""} onChange={e => setForm({ ...form, social_youtube: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الفوترة والمعلومات القانونية" : "Legal & Billing"}</CardTitle>
            <CardDescription>{lang === "ar" ? "الأرقام الضريبية والتجارية للعيادة" : "Registration numbers used on invoices and legal documents."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t("taxRegistrationNumber")}</Label><Input value={form.tax_registration_number ?? ""} onChange={e => setForm({ ...form, tax_registration_number: e.target.value })} /></div>
              <div><Label>{t("commercialRegistrationNumber")}</Label><Input value={form.commercial_registration_number ?? ""} onChange={e => setForm({ ...form, commercial_registration_number: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/90 backdrop-blur-md md:hidden">
          <div className="p-3 flex justify-end">
            <Button className="gradient-primary text-primary-foreground w-full" onClick={save}>{t("save")}</Button>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}