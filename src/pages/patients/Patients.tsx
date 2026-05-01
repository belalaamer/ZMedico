import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Phone, Mail, User as UserIcon, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
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
  phone2: string | null;
  email: string | null;
  gender: "male" | "female" | null;
  city: string | null;
  address: string | null;
  dob: string | null;
  blood_type: string | null;
  notes: string | null;
  branch_id: string | null;
  created_at: string;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  phone: z.string().trim().min(1, "Phone is required").max(30),
  phone2: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  dob: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
  blood_type: z.string().trim().max(10).optional(),
  address: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export default function PatientsPage() {
  const { t, lang } = useI18n();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Patient | null>(null);

  const [form, setForm] = useState({
    name: "", phone: "", phone2: "", email: "",
    dob: "", gender: "" as "" | "male" | "female",
    blood_type: "", address: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    let query = supabase.from("patients").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
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
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Please check the form"); return; }
    const d = parsed.data;
    const payload: any = {
      first_name_en: d.name,
      first_name_ar: d.name,
      phone: d.phone,
      phone2: d.phone2 || null,
      email: d.email || null,
      dob: d.dob || null,
      gender: d.gender || null,
      blood_type: d.blood_type || null,
      address: d.address || null,
      notes: d.notes || null,
      branch_id: currentBranchId,
    };
    const { error } = await supabase.from("patients").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تمت إضافة المريض" : "Patient added");
    setOpen(false);
    setForm({ name: "", phone: "", phone2: "", email: "", dob: "", gender: "", blood_type: "", address: "", notes: "" });
    load();
  };

  const handleDelete = async (p: Patient) => {
    const { error } = await supabase.from("patients").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar" ? "تم حذف المريض" : "Patient deleted");
    setConfirmDel(null);
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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("newPatient")}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Name / الاسم *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={160} placeholder="Full name / الاسم الكامل" />
                </div>
                <div className="space-y-2">
                  <Label>Phone / رقم الهاتف *</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="+20..." maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label>Phone 2 / رقم إضافي</Label>
                  <Input value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label>Email / البريد الإلكتروني</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth / تاريخ الميلاد</Label>
                  <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Gender / النوع</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v as any })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t("male")}</SelectItem>
                      <SelectItem value="female">{t("female")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Blood Type / فصيلة الدم</Label>
                  <Select value={form.blood_type} onValueChange={(v) => setForm({ ...form, blood_type: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Address / العنوان</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Notes / ملاحظات</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={1000} />
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
                <div key={p.id} className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors">
                  <Link to={`/patients/${p.id}`} className="flex items-center gap-4 flex-1 min-w-0">
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
                  </Link>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDel(p); }}
                    aria-label="Delete">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف المريض" : "Delete patient"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذا المريض؟ لا يمكن التراجع عن هذا الإجراء."
                : "Are you sure you want to delete this patient? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && handleDelete(confirmDel)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}