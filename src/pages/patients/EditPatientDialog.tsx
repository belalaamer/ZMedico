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

export function EditPatientDialog({ open, onOpenChange, patient, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; patient: any; onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);
  const [form, setForm] = useState({
    first_name_en: "", last_name_en: "", first_name_ar: "", last_name_ar: "",
    phone: "", phone2: "", email: "", dob: "",
    gender: "" as "" | "male" | "female",
    blood_type: "", address: "", city: "", nationality: "", notes: "",
    assigned_doctor_id: "",
  });

  useEffect(() => {
    (async () => {
      const { data: staff } = await supabase.from("staff_profiles").select("id").eq("status", "active");
      const ids = (staff ?? []).map((s: any) => s.id);
      if (!ids.length) { setDoctors([]); return; }
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const list = (profs ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name ?? p.id.slice(0, 8) }));
      list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setDoctors(list);
    })();
  }, []);

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
    });
  }, [patient, open]);

  // Single name field bound to active-language fields; preserves the other side if already set.
  const nameValue = lang === "ar"
    ? `${form.first_name_ar} ${form.last_name_ar}`.trim()
    : `${form.first_name_en} ${form.last_name_en}`.trim();

  const setName = (v: string) => {
    const parts = v.trim().split(/\s+/);
    const first = parts.shift() ?? "";
    const last = parts.join(" ");
    if (lang === "ar") {
      setForm((f) => ({ ...f, first_name_ar: first, last_name_ar: last, first_name_en: f.first_name_en || first, last_name_en: f.last_name_en || last }));
    } else {
      setForm((f) => ({ ...f, first_name_en: first, last_name_en: last, first_name_ar: f.first_name_ar || first, last_name_ar: f.last_name_ar || last }));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name_en && !form.first_name_ar) { toast.error(t("fullName")); return; }
    if (!form.phone.trim()) { toast.error(t("phone")); return; }
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
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("fullName")} *</Label>
            <Input dir="auto" value={nameValue} onChange={(e) => setName(e.target.value)} required maxLength={160} />
          </div>
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
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v as any })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
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
                {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
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