import { useEffect, useState } from "react";
import { Plus, Edit3, Building2, Power } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RowActions } from "@/components/RowActions";

type Dept = any;

export default function Departments() {
  const { t, lang } = useI18n();
  const { branches, currentBranchId } = useBranch();
  const [items, setItems] = useState<Dept[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [edit, setE] = useState<Dept | null>(null);
  const [form, setForm] = useState({ name: "", description: "", branch_id: "", manager_id: "" });

  const load = async () => {
    const { data } = await supabase.from("departments").select("*").is("deleted_at", null).order("name_en");
    setItems(data ?? []);
    const { data: profs } = await supabase.from("profiles").select("id,full_name,email");
    setProfiles(profs ?? []);
    const { data: staff } = await supabase.from("staff_profiles").select("department_id").not("department_id","is",null);
    const c: Record<string, number> = {};
    (staff ?? []).forEach((s: any) => { c[s.department_id] = (c[s.department_id] ?? 0) + 1; });
    setCounts(c);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setE(null); setForm({ name: "", description: "", branch_id: "", manager_id: "" }); setOpen(true); };
  const openEdit = (d: Dept) => { setE(d); setForm({ name: d.name_en || d.name_ar || "", description: d.description ?? "", branch_id: d.branch_id ?? "", manager_id: d.manager_id ?? "" }); setOpen(true); };
  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Name required"); return; }
    const effectiveBranchId = form.branch_id || currentBranchId;
    if (!effectiveBranchId) {
      toast.error(lang === "ar" ? "اختر الفرع أولاً" : "Select a branch first");
      return;
    }
    const payload: any = { name_en: name, name_ar: name, description: form.description || null, branch_id: effectiveBranchId, manager_id: form.manager_id || null };
    const { error } = edit
      ? await supabase.from("departments").update(payload).eq("id", edit.id)
      : await supabase.from("departments").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("save")); setOpen(false); load();
  };
  const toggle = async (d: Dept) => { await supabase.from("departments").update({ is_active: !d.is_active }).eq("id", d.id); load(); };

  const softDelete = async (d: Dept) => {
    if ((counts[d.id] ?? 0) > 0) { toast.error(lang === "ar" ? "لا يمكن الحذف: يوجد موظفين" : "Cannot delete: has staff"); return; }
    const { error } = await supabase.from("departments").update({ deleted_at: new Date().toISOString() } as any).eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delete")); load();
  };

  const branchName = (id: string | null) => branches.find((b) => b.id === id) ? (lang === "ar" ? branches.find((b) => b.id === id)!.name_ar : branches.find((b) => b.id === id)!.name_en) : "—";
  const profileName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t("departments")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground" onClick={openNew}><Plus className="me-2 size-4" />{t("addDepartment")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit ? t("editDepartment") : t("newDepartment")}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2"><Label>{t("name")} / الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>{t("description")}</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} /></div>
              <div className="space-y-2"><Label>{t("branch")}</Label>
                <Select value={form.branch_id || "none"} onValueChange={(v) => setForm({ ...form, branch_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— {t("none")} —</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t("manager")}</Label>
                <Select value={form.manager_id || "none"} onValueChange={(v) => setForm({ ...form, manager_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— {t("none")} —</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={save}>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="shadow-card overflow-hidden">
        {items.length === 0 ? <div className="p-10 text-center text-muted-foreground">{t("noDepartments")}</div> : (
          <div className="divide-y divide-border">
            {items.map((d) => (
              <div key={d.id} className="flex items-center gap-4 p-4">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Building2 className="size-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{lang === "ar" ? d.name_ar : d.name_en}</div>
                    <Badge variant="outline" className={d.is_active ? "status-completed" : "status-departed"}>{d.is_active ? t("active") : t("inactive")}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                    <span>{t("branch")}: {branchName(d.branch_id)}</span>
                    <span>{t("manager")}: {profileName(d.manager_id)}</span>
                  </div>
                </div>
                <Badge variant="outline">{counts[d.id] ?? 0} {t("staffCount")}</Badge>
                <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Edit3 className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => toggle(d)}><Power className="size-4" /></Button>
                <RowActions onEdit={() => openEdit(d)} onDelete={() => softDelete(d)} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}