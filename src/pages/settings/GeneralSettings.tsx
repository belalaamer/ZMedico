import { useEffect, useState } from "react";
import SettingsLayout from "./SettingsLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function GeneralSettings() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [branchId, setBranchId] = useState<string>(currentBranchId ?? "");
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

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">{t("clinicProfile")}</h1>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-56"><SelectValue placeholder={t("branch")} /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>{t("nameEn2")}</Label><Input value={form.clinic_name_en} onChange={e => setForm({ ...form, clinic_name_en: e.target.value })} /></div>
            <div><Label>{t("nameAr2")}</Label><Input dir="rtl" value={form.clinic_name_ar} onChange={e => setForm({ ...form, clinic_name_ar: e.target.value })} /></div>
            <div><Label>{t("tagline2")} (EN)</Label><Input value={form.tagline_en ?? ""} onChange={e => setForm({ ...form, tagline_en: e.target.value })} /></div>
            <div><Label>{t("tagline2")} (AR)</Label><Input dir="rtl" value={form.tagline_ar ?? ""} onChange={e => setForm({ ...form, tagline_ar: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Logo URL</Label><Input value={form.logo_url ?? ""} onChange={e => setForm({ ...form, logo_url: e.target.value })} /></div>
            <div><Label>{t("phone")}</Label><Input value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>{t("email")}</Label><Input value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>{t("address")} (AR)</Label><Textarea dir="rtl" value={form.address_ar ?? ""} onChange={e => setForm({ ...form, address_ar: e.target.value })} /></div>
            <div><Label>{t("city")}</Label><Input value={form.city ?? ""} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>Country</Label><Input value={form.country ?? ""} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            <div><Label>{t("workingHours")} Start</Label><Input type="time" value={form.working_hours_start} onChange={e => setForm({ ...form, working_hours_start: e.target.value })} /></div>
            <div><Label>{t("workingHours")} End</Label><Input type="time" value={form.working_hours_end} onChange={e => setForm({ ...form, working_hours_end: e.target.value })} /></div>
            <div><Label>Facebook</Label><Input value={form.social_facebook ?? ""} onChange={e => setForm({ ...form, social_facebook: e.target.value })} /></div>
            <div><Label>Instagram</Label><Input value={form.social_instagram ?? ""} onChange={e => setForm({ ...form, social_instagram: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input value={form.social_whatsapp ?? ""} onChange={e => setForm({ ...form, social_whatsapp: e.target.value })} /></div>
            <div><Label>{t("taxRegistrationNumber")}</Label><Input value={form.tax_registration_number ?? ""} onChange={e => setForm({ ...form, tax_registration_number: e.target.value })} /></div>
            <div><Label>{t("commercialRegistrationNumber")}</Label><Input value={form.commercial_registration_number ?? ""} onChange={e => setForm({ ...form, commercial_registration_number: e.target.value })} /></div>
          </div>
          <div className="flex justify-end"><Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button></div>
        </Card>
      </div>
    </SettingsLayout>
  );
}