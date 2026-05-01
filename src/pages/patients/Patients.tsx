import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Phone, Mail, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

type Patient = {
  id: string;
  patient_code: number;
  first_name_en: string;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  phone: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  city: string | null;
  branch_id: string | null;
  created_at: string;
};

const schema = z.object({
  first_name_en: z.string().trim().min(1).max(80),
  last_name_en: z.string().trim().max(80).optional(),
  first_name_ar: z.string().trim().max(80).optional(),
  last_name_ar: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional(),
  gender: z.enum(["male", "female"]).optional(),
});

export default function PatientsPage() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    first_name_en: "", last_name_en: "", first_name_ar: "", last_name_ar: "",
    phone: "", email: "", city: "", gender: "" as "" | "male" | "female",
  });

  const load = async () => {
    setLoading(true);
    let query = supabase.from("patients").select("*").order("created_at", { ascending: false }).limit(200);
    if (currentBranchId) query = query.eq("branch_id", currentBranchId);
    const { data, error } = await query;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Patient[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentBranchId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error("Please check the form fields"); return; }
    const payload = {
      ...parsed.data,
      email: parsed.data.email || null,
      gender: parsed.data.gender || null,
      branch_id: currentBranchId,
    };
    const { error } = await supabase.from("patients").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تمت إضافة المريض" : "Patient added");
    setOpen(false);
    setForm({ first_name_en: "", last_name_en: "", first_name_ar: "", last_name_ar: "", phone: "", email: "", city: "", gender: "" });
    load();
  };

  const filtered = items.filter((p) => {
    if (!q) return true;
    const n = `${p.first_name_en} ${p.last_name_en ?? ""} ${p.first_name_ar ?? ""} ${p.last_name_ar ?? ""} ${p.phone ?? ""} ${p.email ?? ""}`.toLowerCase();
    return n.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("patients")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} {t("patients").toLowerCase()}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground"><Plus className="me-2 size-4" />{t("addPatient")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{t("newPatient")}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First name (EN)</Label>
                  <Input value={form.first_name_en} onChange={(e) => setForm({ ...form, first_name_en: e.target.value })} required maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label>Last name (EN)</Label>
                  <Input value={form.last_name_en} onChange={(e) => setForm({ ...form, last_name_en: e.target.value })} maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label>الاسم الأول (AR)</Label>
                  <Input dir="rtl" value={form.first_name_ar} onChange={(e) => setForm({ ...form, first_name_ar: e.target.value })} maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label>الاسم الأخير (AR)</Label>
                  <Input dir="rtl" value={form.last_name_ar} onChange={(e) => setForm({ ...form, last_name_ar: e.target.value })} maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label>{t("phone")}</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+20..." maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label>{t("email")}</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label>{t("city")}</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={80} />
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
                <DialogFooter className="sm:col-span-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                  <Button type="submit" className="gradient-primary text-primary-foreground">{t("save")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="shadow-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">{t("noPatients")}</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((p) => {
              const name = lang === "ar"
                ? `${p.first_name_ar ?? p.first_name_en} ${p.last_name_ar ?? p.last_name_en ?? ""}`.trim()
                : `${p.first_name_en} ${p.last_name_en ?? ""}`.trim();
              return (
                <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                  <div className="size-10 rounded-full gradient-primary text-primary-foreground flex items-center justify-center font-semibold">
                    {name.slice(0,1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{name}</div>
                      <Badge variant="outline" className="text-[10px]">#{p.patient_code}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      {p.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{p.phone}</span>}
                      {p.email && <span className="flex items-center gap-1"><Mail className="size-3" />{p.email}</span>}
                      {p.city && <span className="flex items-center gap-1"><UserIcon className="size-3" />{p.city}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className="status-progress">{t("statusInProgress")}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}