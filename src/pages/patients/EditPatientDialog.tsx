import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ReferrerPicker } from "./ReferrerPicker";
import { doctorDisplayName } from "@/lib/doctorName";

export function EditPatientDialog({ open, onOpenChange, patient, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; patient: any; onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string; full_name_en?: string | null; full_name_ar?: string | null }[]>([]);
  const [form, setForm] = useState({
    first_name_en: "", last_name_en: "", first_name_ar: "", last_name_ar: "",
    phone: "", phone2: "", email: "", dob: "",
    gender: "" as "" | "male" | "female",
    blood_type: "", address: "", city: "", nationality: "", notes: "",
    assigned_doctor_id: "",
    referred_by_patient_id: null as string | null,
  });

  const [nameEnDraft, setNameEnDraft] = useState("");
  const [nameArDraft, setNameArDraft] = useState("");

  useEffect(() => {
    (async () => {
      // Fetch via SECURITY DEFINER RPC so front-desk/nurse roles (no SELECT on user_roles) can load doctors.
      const { data } = await supabase.rpc("list_doctors");
      const list = ((data ?? []) as any[]).map((p: any) => ({
        id: p.id,
        full_name: p.full_name ?? p.id.slice(0, 8),
        full_name_en: p.full_name_en ?? null,
        full_name_ar: p.full_name_ar ?? null,
      }));
      list.sort((a, b) => doctorDisplayName(a, lang).localeCompare(doctorDisplayName(b, lang)));
      setDoctors(list);
    })();
  }, [lang]);

  useEffect(() => {
    if (!patient) return;
    setForm({
      first_name_en: patient.first_name_en ?? "",
      last_name_en: patient.last_name_en ?? "",
      first_name_ar: patient.first_name_ar ?? "",
      last_name_ar: patient.last_name_ar ?? "",
      phone: patient.phone ?? "",
      phone2: patient.phone2 ?? "",
      email: patient.email ?? "",
      dob: patient.dob ?? "",
      gender: (patient.gender as any) ?? "",
      blood_type: patient.blood_type ?? "",
      address: patient.address ?? "",
      city: patient.city ?? "",
      nationality: patient.nationality ?? "",
      notes: patient.notes ?? "",
      assigned_doctor_id: (patient as any).assigned_doctor_id ?? "",
      referred_by_patient_id: (patient as any).referred_by_patient_id ?? null,
    });
    setNameEnDraft(`${patient.first_name_en ?? ""} ${patient.last_name_en ?? ""}`.trim());
    setNameArDraft(`${patient.first_name_ar ?? ""} ${patient.last_name_ar ?? ""}`.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient, open]);

  const setLocalizedName = (value: string, language: "en" | "ar") => {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    const first = parts.shift() ?? "";
    const last = parts.join(" ");
    if (language === "en") {
      setNameEnDraft(value);
      setForm((f) => ({ ...f, first_name_en: first, last_name_en: last }));
    } else {
      setNameArDraft(value);
      setForm((f) => ({ ...f, first_name_ar: first, last_name_ar: last }));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name_en && !form.first_name_ar) { toast.error(t("fullName")); return; }
    if (!form.phone.trim()) { toast.error(t("phone")); return; }
    if (form.referred_by_patient_id && form.referred_by_patient_id === patient?.id) {
      toast.error(t("selfReferralNotAllowed")); return;
    }
    setSaving(true);
    const payload: any = {
      first_name_en: form.first_name_en || form.first_name_ar,
      last_name_en: form.last_name_en || null,
      first_name_ar: form.first_name_ar || form.first_name_en,
      last_name_ar: form.last_name_ar || null,
      phone: form.phone,
      phone2: form.phone2 || null,
      email: form.email || null,
      dob: form.dob || null,
      gender: form.gender || null,
      blood_type: form.blood_type || null,
      address: form.address || null,
      city: form.city || null,
      nationality: form.nationality || null,
      notes: form.notes || null,
      assigned_doctor_id: form.assigned_doctor_id || null,
      referred_by_patient_id: form.referred_by_patient_id || null,
    };
    const { error } = await supabase.from("patients").update(payload).eq("id", patient.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("save"));
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("editPatient")}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{lang === "ar" ? "الاسم بالإنجليزية" : "Name in English"}</Label>
            <Input dir="ltr" value={nameEnDraft} onChange={(e) => setLocalizedName(e.target.value, "en")} maxLength={160} placeholder="Mohamed Ibrahim" />
          </div>
          <div className="space-y-2">
            <Label>{lang === "ar" ? "الاسم بالعربية" : "Name in Arabic"}</Label>
            <Input dir="rtl" value={nameArDraft} onChange={(e) => setLocalizedName(e.target.value, "ar")} maxLength={160} placeholder="محمد إبراهيم" />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground -mt-2">{lang === "ar" ? "أدخل اسمًا واحدًا على الأقل؛ ويمكنك تعبئة الاسمين معًا." : "Enter at least one name; you may provide both languages."}</p>
          <div className="space-y-2">
            <Label>{t("phone")} *</Label>
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required maxLength={30} />
          </div>
          <div className="space-y-2">
            <Label>{t("phone2")}</Label>
            <Input dir="ltr" value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} maxLength={30} />
          </div>
          <div className="space-y-2">
            <Label>{t("email")}</Label>
            <Input dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label>{t("dob")}</Label>
            <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("gender")}</Label>
            <Select value={form.gender || "none"} onValueChange={(v) => setForm({ ...form, gender: v === "none" ? "" : v as any })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— {t("none")} —</SelectItem>
                <SelectItem value="male">{t("male")}</SelectItem>
                <SelectItem value="female">{t("female")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("bloodType")}</Label>
            <Select value={form.blood_type} onValueChange={(v) => setForm({ ...form, blood_type: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("city")}</Label>
            <Input dir="auto" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label>{t("nationality")}</Label>
            <Input dir="auto" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{lang === "ar" ? "الطبيب المسؤول" : "Assigned Doctor"}</Label>
            <Select value={form.assigned_doctor_id || "none"} onValueChange={(v) => setForm({ ...form, assigned_doctor_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— {lang === "ar" ? "لا يوجد" : "None"} —</SelectItem>
                {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{doctorDisplayName(d, lang)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("referredByPatient")}</Label>
            <ReferrerPicker
              value={form.referred_by_patient_id}
              onChange={(v) => setForm({ ...form, referred_by_patient_id: v })}
              excludeId={patient?.id}
              branchId={(patient as any)?.branch_id ?? null}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("address")}</Label>
            <Input dir="auto" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("notes")}</Label>
            <Textarea dir="auto" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={1000} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" disabled={saving} className="gradient-primary text-primary-foreground">{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
